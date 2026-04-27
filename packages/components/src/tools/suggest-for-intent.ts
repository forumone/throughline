import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { type AuditWriter, withMeta } from '@forumone/throughline-core'
import type { ComponentContract } from '@forumone/throughline-design-contract'
import type { ManifestLoader } from '../manifest-source.js'
import type { Matcher, RankedSuggestion } from '../matching/types.js'
import { validateComposition } from '../validation/composition.js'

export interface SuggestForIntentDeps {
  loader: ManifestLoader
  matcher: Matcher
  auditWriter: AuditWriter
  maxRecommendations: number
}

export function createSuggestForIntentTool(deps: SuggestForIntentDeps): McpToolDefinition {
  const inputSchema = withMeta({
    intent: z
      .string()
      .min(5)
      .describe('Natural-language description of what to accomplish (e.g. "introduce a new program")'),
    context: z
      .object({
        existingBlocks: z
          .array(z.string())
          .optional()
          .describe('Component names already on the page, in order'),
        pageType: z
          .string()
          .optional()
          .describe('Optional page-type hint: landing, article, program, etc.'),
      })
      .optional(),
  })

  return {
    name: 'suggest_for_intent',
    description:
      "Given a natural-language description of what the author wants to accomplish, returns ranked component recommendations with reasoning. Optionally accepts the existing page context so duplicate Heroes / composition conflicts surface as warnings on the suggestions.",
    inputSchema,
    handler: async (input, ctx) => {
      const manifest = await deps.loader.get()
      const allComponents = Object.values(manifest.raw.components)

      const ranked = deps.matcher.rank(input.intent)
      const recommendations: RankedSuggestion[] = []

      for (const { component, score } of ranked) {
        if (recommendations.length >= deps.maxRecommendations) break

        const warnings = collectWarnings(component, input.context?.existingBlocks, manifest)
        recommendations.push({
          component: component.name,
          score,
          reasoning: formatReasoning(component, score, warnings),
          matchedIntent: component.examples[0]?.intent ?? component.intent,
          ...(warnings.length > 0 ? { warnings } : {}),
        })
      }

      // Audit (fire-and-forget; never blocks the response).
      await deps.auditWriter({
        actor: {
          type: 'user',
          userId: ctx.user?.id,
          userName: ctx.user?.name,
          apiKeyName: ctx.apiKeyName,
        },
        action: 'design.suggest',
        mcpServer: 'component',
        mcpTool: 'suggest_for_intent',
        prompt: input._meta?.userPrompt ?? input.intent,
        reasoning: input._meta?.reasoning,
        changesSummary: `Suggested components for: ${input.intent.slice(0, 120)}`,
      })

      // Quiet the unused-variable lint when the recommendation set
      // is smaller than the candidate pool — `allComponents` keeps the
      // contract method available for future extensions.
      void allComponents
      return { recommendations }
    },
  }
}

function collectWarnings(
  component: ComponentContract,
  existingBlocks: string[] | undefined,
  manifest: Parameters<typeof validateComposition>[1],
): string[] {
  if (!existingBlocks || existingBlocks.length === 0) return []
  const proposed = [
    ...existingBlocks.map((type) => ({ type })),
    { type: component.name },
  ]
  const result = validateComposition({ blocks: proposed }, manifest)
  return result.issues
    .filter((i) => i.severity === 'error' && i.blockIndex === proposed.length - 1)
    .map((i) => i.message)
}

function formatReasoning(
  component: ComponentContract,
  score: number,
  warnings: string[],
): string {
  const confidence = score > 0.3 ? 'strong match' : score > 0.05 ? 'moderate match' : 'possible match'
  const base = `${component.name}: ${confidence}. ${component.description}`
  if (warnings.length === 0) return base
  return `${base} Note: ${warnings.join(' ')}`
}

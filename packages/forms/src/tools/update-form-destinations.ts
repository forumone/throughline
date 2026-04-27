import { z } from 'zod'
import type { Payload } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { withMeta, getAuditWriter } from '@forumone/throughline-core'
import type { ResolvedFormsConfig } from '../options.js'
import { validateDestinationLabel } from '../destinations.js'
import { deniedEnvelope, isFormsAuthor } from './access.js'

const inputSchema = withMeta({
  formId: z.string(),
  destinationLabels: z.array(z.string()).min(1),
})

export interface UpdateFormDestinationsDeps {
  payload: Payload
  resolved: ResolvedFormsConfig
}

export function createUpdateFormDestinationsTool(
  deps: UpdateFormDestinationsDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'update_form_destinations',
    description:
      "Replaces a form's destinations with the given labels. Every label must be on the allowlist (use list_allowed_destinations to discover). The replace-all semantics are deliberate — incremental destination edits are too easy to misuse via prompt injection.",
    inputSchema,
    handler: async (input, ctx) => {
      if (!isFormsAuthor(ctx)) {
        return deniedEnvelope('Only admins and editors can update form destinations.')
      }

      const seen = new Set<string>()
      for (const label of input.destinationLabels) {
        if (seen.has(label)) return deniedEnvelope(`Duplicate destination label "${label}".`)
        seen.add(label)
        const check = validateDestinationLabel(deps.resolved.options, label)
        if (!check.ok) return deniedEnvelope(check.reason ?? 'Destination not on the allowlist.')
      }

      let existing: Record<string, unknown> | null = null
      try {
        existing = (await deps.payload.findByID({
          collection: deps.resolved.formsCollectionSlug,
          id: input.formId,
        })) as Record<string, unknown> | null
      } catch {
        existing = null
      }
      if (!existing) return deniedEnvelope(`No form with id "${input.formId}".`)

      const policy = ((existing['policy'] ?? {}) as Record<string, unknown>)
      const updatedPolicy = {
        ...policy,
        destinations: input.destinationLabels.map((label) => ({ label, enabled: true })),
      }

      await deps.payload.update({
        collection: deps.resolved.formsCollectionSlug,
        id: input.formId,
        data: { policy: updatedPolicy },
      })

      const auditWriter = getAuditWriter(deps.payload)
      await auditWriter({
        actor: {
          type: 'user',
          ...(ctx.user?.id ? { userId: ctx.user.id } : {}),
          ...(ctx.user?.name ? { userName: ctx.user.name } : {}),
          ...(ctx.apiKeyName ? { apiKeyName: ctx.apiKeyName } : {}),
        },
        action: 'form.updated',
        mcpServer: 'forms',
        mcpTool: 'update_form_destinations',
        targetCollection: deps.resolved.formsCollectionSlug,
        targetId: input.formId,
        targetTitle: typeof existing['title'] === 'string' ? (existing['title'] as string) : undefined,
        ...(input._meta?.userPrompt ? { prompt: input._meta.userPrompt } : {}),
        ...(input._meta?.reasoning ? { reasoning: input._meta.reasoning } : {}),
        changesSummary: `Set destinations to: ${input.destinationLabels.join(', ')}.`,
      })

      return {
        ok: true,
        formId: input.formId,
        destinations: input.destinationLabels,
      }
    },
  }
}

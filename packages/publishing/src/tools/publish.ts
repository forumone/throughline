import { z } from 'zod'
import type { Payload } from 'payload'
import { type AuditWriter, withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { type PublishingPluginOptions, resolveCollection } from '../options.js'
import { runPublishPipeline } from '../pipeline/index.js'

export interface PublishToolDeps {
  payload: Payload
  options: PublishingPluginOptions
  auditWriter: AuditWriter
}

export function createPublishTool(deps: PublishToolDeps): McpToolDefinition {
  const inputSchema = withMeta({
    collection: z.string().describe('The collection slug (e.g. "pages")'),
    id: z.string().describe('The document ID'),
  })

  return {
    name: 'publish',
    description:
      "Publishes a draft document. Runs the full publish pipeline: composition, accessibility, required-field, embargo, and approval checks. Returns success with the publish timestamp, or a specific failedAt step with reason / suggestion when something blocks the publish.",
    inputSchema,
    handler: async (input, ctx) => {
      const collection = resolveCollection(deps.options, input.collection)
      const document = (await deps.payload.findByID({
        collection: collection.slug,
        id: input.id,
        draft: true,
      })) as Record<string, unknown>

      const result = await runPublishPipeline({
        payload: deps.payload,
        inngest: deps.options.inngest,
        options: deps.options,
        collection,
        document,
        documentId: input.id,
        actor: { user: ctx.user, apiKeyName: ctx.apiKeyName },
        ...(input._meta ? { meta: input._meta } : {}),
      })

      await deps.auditWriter({
        actor: {
          type: ctx.user ? 'user' : 'system',
          userId: ctx.user?.id,
          userName: ctx.user?.name,
          apiKeyName: ctx.apiKeyName,
        },
        action: 'publishing.publish',
        mcpServer: 'publishing',
        mcpTool: 'publish',
        targetCollection: input.collection,
        targetId: input.id,
        targetTitle: stringField(document, 'title') ?? input.id,
        prompt: input._meta?.userPrompt,
        reasoning: input._meta?.reasoning,
        changesSummary: input._meta?.changesSummary,
        success: result.success,
        errorMessage: result.success ? undefined : result.reason,
      })

      if (result.success) {
        return {
          published: true,
          publishedAt: result.publishedAt,
        }
      }
      return {
        published: false,
        failedAt: result.failedAt,
        reason: result.reason,
        code: result.code,
        issues: result.issues,
        suggestion: result.suggestion,
      }
    },
  }
}

function stringField(doc: Record<string, unknown>, name: string): string | undefined {
  const value = doc[name]
  return typeof value === 'string' ? value : undefined
}

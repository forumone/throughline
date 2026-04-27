import { z } from 'zod'
import type { Payload } from 'payload'
import { withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { type PublishingPluginOptions, resolveCollection } from '../options.js'
import { runPreflightPipeline } from '../pipeline/index.js'

export interface GetPublishStatusToolDeps {
  payload: Payload
  options: PublishingPluginOptions
}

export function createGetPublishStatusTool(deps: GetPublishStatusToolDeps): McpToolDefinition {
  const inputSchema = withMeta({
    collection: z.string(),
    id: z.string(),
  })

  return {
    name: 'get_publish_status',
    description:
      "Returns the current publishability of a document without actually publishing. Reports current status, whether unpublished changes exist, the last publish timestamp, and a preflight result indicating whether `publish` would currently succeed. Read-only; no audit record is written.",
    inputSchema,
    handler: async (input, ctx) => {
      const collection = resolveCollection(deps.options, input.collection)
      const document = (await deps.payload.findByID({
        collection: collection.slug,
        id: input.id,
        draft: true,
      })) as Record<string, unknown>

      const preflight = await runPreflightPipeline({
        payload: deps.payload,
        inngest: deps.options.inngest,
        options: deps.options,
        collection,
        document,
        documentId: input.id,
        actor: { user: ctx.user, apiKeyName: ctx.apiKeyName },
      })

      const updatedAt = document['updatedAt']
      const publishedAt = document[collection.publishedAtField]
      const hasUnpublishedChanges =
        typeof updatedAt === 'string' &&
        typeof publishedAt === 'string' &&
        Date.parse(updatedAt) > Date.parse(publishedAt)

      return {
        currentStatus: document['_status'] ?? 'draft',
        hasUnpublishedChanges,
        lastPublished: typeof publishedAt === 'string' ? publishedAt : null,
        wouldPublish: {
          canPublish: preflight.success,
          ...(preflight.success
            ? {}
            : {
                blockedAt: preflight.failedAt,
                code: preflight.code,
                reason: preflight.reason,
                suggestion: preflight.suggestion,
                issues: preflight.issues ?? [],
              }),
        },
      }
    },
  }
}

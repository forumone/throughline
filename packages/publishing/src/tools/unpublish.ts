import { z } from 'zod'
import type { Payload } from 'payload'
import { type AuditWriter, withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { type PublishingPluginOptions, resolveCollection } from '../options.js'

export interface UnpublishToolDeps {
  payload: Payload
  options: PublishingPluginOptions
  auditWriter: AuditWriter
}

export function createUnpublishTool(deps: UnpublishToolDeps): McpToolDefinition {
  const inputSchema = withMeta({
    collection: z.string(),
    id: z.string(),
  })

  return {
    name: 'unpublish',
    description:
      'Unpublishes a published document by reverting it to draft. Use when content needs to be removed from the public site without deleting it. Fires content/page.unpublished so revalidation and integrations can react.',
    inputSchema,
    handler: async (input, ctx) => {
      const collection = resolveCollection(deps.options, input.collection)
      const document = (await deps.payload.findByID({
        collection: collection.slug,
        id: input.id,
        draft: true,
      })) as Record<string, unknown>

      if (document['_status'] !== 'published') {
        return { unpublished: false, reason: 'Document is not currently published' }
      }

      await deps.payload.update({
        collection: collection.slug,
        id: input.id,
        data: { _status: 'draft' },
        context: { bypassPublishingServer: true },
      })

      const slug = document[collection.slugField]
      await deps.options.inngest.send({
        name: 'content/page.unpublished',
        data: {
          collection: collection.slug,
          id: input.id,
          slug: typeof slug === 'string' ? slug : input.id,
          unpublishedBy: ctx.user?.id ?? 'system',
        },
      })

      await deps.auditWriter({
        actor: {
          type: ctx.user ? 'user' : 'system',
          userId: ctx.user?.id,
          userName: ctx.user?.name,
          apiKeyName: ctx.apiKeyName,
        },
        action: 'publishing.unpublish',
        mcpServer: 'publishing',
        mcpTool: 'unpublish',
        targetCollection: input.collection,
        targetId: input.id,
        targetTitle: typeof document['title'] === 'string' ? document['title'] : input.id,
        prompt: input._meta?.userPrompt,
        reasoning: input._meta?.reasoning,
        changesSummary: input._meta?.changesSummary,
        success: true,
      })

      return { unpublished: true }
    },
  }
}

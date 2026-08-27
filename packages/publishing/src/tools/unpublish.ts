import { z } from 'zod'
import type { Payload } from 'payload'
import { type AuditWriter, withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { PublishingPluginOptions } from '../options.js'
import { createPublishingService, type PublishingService } from '../service.js'

export interface UnpublishToolDeps {
  payload: Payload
  options: PublishingPluginOptions
  auditWriter: AuditWriter
  /** Injected by the plugin so every channel shares one service instance. */
  service?: PublishingService
}

export function createUnpublishTool(deps: UnpublishToolDeps): McpToolDefinition {
  const inputSchema = withMeta({
    collection: z.string(),
    id: z.string(),
  })

  const service = deps.service ?? createPublishingService(deps)

  return {
    name: 'unpublish',
    requiredScope: 'publishing.execute',
    description:
      'Unpublishes a published document by reverting it to draft. Use when content needs to be removed from the public site without deleting it. Fires content/page.unpublished so revalidation and integrations can react.',
    inputSchema,
    handler: async (input, ctx) =>
      service.unpublish({
        collection: input.collection,
        id: input.id,
        actor: { user: ctx.user, apiKeyName: ctx.apiKeyName, channel: 'mcp' },
        ...(input._meta ? { meta: input._meta } : {}),
      }),
  }
}

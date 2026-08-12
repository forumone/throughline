import { z } from 'zod'
import type { Payload } from 'payload'
import { type AuditWriter, withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { PublishingPluginOptions } from '../options.js'
import { createPublishingService, type PublishingService } from '../service.js'

export interface PublishToolDeps {
  payload: Payload
  options: PublishingPluginOptions
  auditWriter: AuditWriter
  /** Injected by the plugin so every channel shares one service instance. */
  service?: PublishingService
}

export function createPublishTool(deps: PublishToolDeps): McpToolDefinition {
  const inputSchema = withMeta({
    collection: z.string().describe('The collection slug (e.g. "pages")'),
    id: z.string().describe('The document ID'),
  })

  const service = deps.service ?? createPublishingService(deps)

  return {
    name: 'publish',
    description:
      "Publishes a draft document. Runs the full publish pipeline: composition, accessibility, required-field, embargo, and approval checks. Returns success with the publish timestamp, or a specific failedAt step with reason / suggestion when something blocks the publish.",
    inputSchema,
    handler: async (input, ctx) =>
      service.publish({
        collection: input.collection,
        id: input.id,
        actor: { user: ctx.user, apiKeyName: ctx.apiKeyName, channel: 'mcp' },
        ...(input._meta ? { meta: input._meta } : {}),
      }),
  }
}

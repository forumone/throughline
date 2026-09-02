import { z } from 'zod'
import type { Payload } from 'payload'
import { type AuditWriter, withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { PublishingPluginOptions } from '../options.js'
import { createPublishingService, type PublishingService } from '../service.js'
import { PUBLISHING_TOOLS } from './descriptors.js'

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
    ...PUBLISHING_TOOLS.publish,
    /*
    Declared, and read by nothing. The per-key checkbox `plugin-mcp` generates
    is what gates this tool; this records that publishing is consequential, and
    is the mapping a scope-aware default would be built from. See
    `McpToolDefinition`.
    */
    requiredScope: 'publishing.execute',
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

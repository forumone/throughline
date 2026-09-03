import { z } from 'zod'
import type { Payload } from 'payload'
import { type AuditWriter, withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { PublishingPluginOptions } from '../options.js'
import { createPublishingService, type PublishingService } from '../service.js'
import { resolvePublishingActor } from './actor.js'
import { PUBLISHING_TOOLS } from './descriptors.js'

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
    ...PUBLISHING_TOOLS.unpublish,
    requiredScope: 'publishing.execute',
    inputSchema,
    handler: async (input, ctx) => {
      const actor = resolvePublishingActor(ctx)
      if ('error' in actor) return actor

      return service.unpublish({
        collection: input.collection,
        id: input.id,
        actor,
        ...(input._meta ? { meta: input._meta } : {}),
      })
    },
  }
}

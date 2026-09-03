import { z } from 'zod'
import type { Payload } from 'payload'
import { withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { PublishingPluginOptions } from '../options.js'
import { createPublishingService, type PublishingService } from '../service.js'
import { resolvePublishingActor } from './actor.js'
import { PUBLISHING_TOOLS } from './descriptors.js'

export interface GetPublishStatusToolDeps {
  payload: Payload
  options: PublishingPluginOptions
  /** Injected by the plugin so every channel shares one service instance. */
  service?: PublishingService
}

export function createGetPublishStatusTool(deps: GetPublishStatusToolDeps): McpToolDefinition {
  const inputSchema = withMeta({
    collection: z.string(),
    id: z.string(),
  })

  const service =
    deps.service ??
    createPublishingService({ ...deps, auditWriter: async () => {} })

  return {
    ...PUBLISHING_TOOLS.getPublishStatus,
    inputSchema,
    handler: async (input, ctx) => {
      const actor = resolvePublishingActor(ctx)
      if ('error' in actor) return actor

      const status = await service.getStatus({
        collection: input.collection,
        id: input.id,
        actor,
      })

      return {
        currentStatus: status.status,
        hasUnpublishedChanges: status.hasUnpublishedChanges,
        lastPublished: status.publishedAt,
        wouldPublish: {
          canPublish: status.publishable,
          ...(status.publishable
            ? {}
            : {
                blockedAt: status.failedAt,
                code: status.code,
                reason: status.reason,
                suggestion: status.suggestion,
                issues: status.issues ?? [],
              }),
        },
      }
    },
  }
}

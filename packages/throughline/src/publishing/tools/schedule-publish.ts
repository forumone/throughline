import { z } from 'zod'
import type { Payload } from 'payload'
import { type AuditWriter } from '../../audit/writer.js'
import { withMeta } from '../../mcp/meta.js'
import type { McpToolDefinition } from '../../plugin-contract/mcp.js'
import type { PublishingPluginOptions } from '../options.js'
import { createPublishingService, type PublishingService } from '../service.js'
import { resolvePublishingActor } from './actor.js'
import { PUBLISHING_TOOLS } from './descriptors.js'

export interface SchedulePublishToolDeps {
  options: PublishingPluginOptions
  /** Injected by the plugin so every channel shares one service instance. */
  service?: PublishingService
  /** Needed only when `service` is not supplied. */
  payload?: Payload
  auditWriter?: AuditWriter
}

/**
 * Schedules a publish over MCP. The work is `PublishingService.schedule`, the
 * same call the admin's Schedule control makes — so the two channels cannot
 * disagree about what is checked, how the time is stored, or what is audited.
 */
export function createSchedulePublishTool(deps: SchedulePublishToolDeps): McpToolDefinition {
  const inputSchema = withMeta({
    collection: z.string(),
    id: z.string(),
    publishAt: z
      .string()
      .datetime({ offset: true })
      .describe('ISO 8601 timestamp at which the document should be published'),
  })

  const service = deps.service ?? createServiceFrom(deps)

  return {
    ...PUBLISHING_TOOLS.schedulePublish,
    requiredScope: 'publishing.execute',
    inputSchema,
    handler: async (input, ctx) => {
      const actor = resolvePublishingActor(ctx)
      if ('error' in actor) return actor

      return service.schedule({
        collection: input.collection,
        id: input.id,
        publishAt: input.publishAt,
        actor,
        ...(input._meta ? { meta: input._meta } : {}),
      })
    },
  }
}

function createServiceFrom(deps: SchedulePublishToolDeps): PublishingService {
  if (!deps.payload || !deps.auditWriter) {
    throw new Error('createSchedulePublishTool needs `service`, or `payload` and `auditWriter`')
  }
  return createPublishingService({
    payload: deps.payload,
    options: deps.options,
    auditWriter: deps.auditWriter,
  })
}

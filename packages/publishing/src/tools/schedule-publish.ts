import { z } from 'zod'
import type { Payload } from 'payload'
import { type AuditWriter, withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { sendEventSafely } from '../events.js'
import { type PublishingPluginOptions, resolveCollection } from '../options.js'
import { runPreflightPipeline } from '../pipeline/index.js'

export interface SchedulePublishToolDeps {
  payload: Payload
  options: PublishingPluginOptions
  auditWriter: AuditWriter
}

export function createSchedulePublishTool(deps: SchedulePublishToolDeps): McpToolDefinition {
  const inputSchema = withMeta({
    collection: z.string(),
    id: z.string(),
    publishAt: z
      .string()
      .datetime()
      .describe('ISO 8601 timestamp at which the document should be published'),
  })

  return {
    name: 'schedule_publish',
    requiredScope: 'publishing.execute',
    description:
      "Schedules a future publish. Validates the document would currently pass the preflight pipeline (composition, accessibility, required fields, embargo, approval), then stores `scheduledPublishAt` on the document. The framework's workflow runner picks up the schedule and executes the full publish pipeline at that time.",
    inputSchema,
    handler: async (input, ctx) => {
      const collection = resolveCollection(deps.options, input.collection)
      const publishAtMs = Date.parse(input.publishAt)
      if (publishAtMs <= Date.now()) {
        return {
          scheduled: false,
          reason: 'publishAt must be in the future',
        }
      }

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
        ...(input._meta ? { meta: input._meta } : {}),
      })

      if (!preflight.success) {
        await deps.auditWriter({
          actor: { type: ctx.user ? 'user' : 'system', userId: ctx.user?.id, apiKeyName: ctx.apiKeyName },
          action: 'publishing.schedule',
          mcpServer: 'publishing',
          mcpTool: 'schedule_publish',
          targetCollection: input.collection,
          targetId: input.id,
          prompt: input._meta?.userPrompt,
          success: false,
          errorMessage: preflight.reason,
        })
        return {
          scheduled: false,
          failedAt: preflight.failedAt,
          reason: preflight.reason,
          code: preflight.code,
          issues: preflight.issues,
          suggestion: preflight.suggestion,
        }
      }

      // Writing a date onto a document somebody is editing is the same
      // collision as publishing it — quieter, and harder to notice afterwards.
      await deps.payload.update({
        collection: collection.slug,
        id: input.id,
        data: { [collection.scheduledPublishField]: input.publishAt },
        overrideLock: false,
        context: { bypassPublishingServer: false },
      })

      // The schedule is already persisted; a failed emission must not undo
      // that or lose the audit record below.
      const warning = await sendEventSafely(deps.options.inngest, {
        name: 'content/page.scheduled',
        data: {
          collection: collection.slug,
          id: input.id,
          scheduledFor: input.publishAt,
        },
      })

      await deps.auditWriter({
        actor: { type: ctx.user ? 'user' : 'system', userId: ctx.user?.id, apiKeyName: ctx.apiKeyName },
        action: 'publishing.schedule',
        mcpServer: 'publishing',
        mcpTool: 'schedule_publish',
        targetCollection: input.collection,
        targetId: input.id,
        targetTitle: typeof document['title'] === 'string' ? document['title'] : input.id,
        prompt: input._meta?.userPrompt,
        reasoning: input._meta?.reasoning,
        changesSummary: `Scheduled publish for ${input.publishAt}`,
        success: true,
      })

      return {
        scheduled: true,
        scheduledFor: input.publishAt,
        ...(warning ? { warnings: [warning] } : {}),
      }
    },
  }
}

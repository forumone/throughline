import { z } from 'zod'
import type { Payload, Where } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { formatAuditEvent } from '../formatting/index.js'
import { deniedEnvelope, isAuditReader } from './access.js'

export interface WhoChangedWhatDeps {
  payload: Payload
  collectionSlug: string
}

const inputSchema = z.object({
  actorId: z
    .string()
    .optional()
    .describe('User ID to look up. Defaults to the authenticated caller.'),
  dateRange: z
    .object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    })
    .optional(),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Max results. Default: 25.'),
})

export function createWhoChangedWhatTool(
  deps: WhoChangedWhatDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'who_changed_what',
    description:
      "A user's recent activity. Use when someone asks 'what has Sarah been working on?' or 'show me my changes today'. If actorId is omitted, defaults to the authenticated caller — so users can ask about themselves without knowing their ID. Other users' activity requires admin/editor.",
    inputSchema,
    handler: async (input, ctx) => {
      const callerId = ctx.user?.id
      const actorId = input.actorId ?? callerId
      if (!actorId) return deniedEnvelope('No actorId provided and no authenticated caller.')

      const queryingSelf = !!callerId && actorId === callerId
      if (!queryingSelf && !isAuditReader(ctx)) {
        return deniedEnvelope("Only admins and editors can look up other users' activity.")
      }

      const conditions: Where[] = [{ 'actor.userId': { equals: actorId } }]
      if (input.dateRange?.from) {
        conditions.push({ createdAt: { greater_than_equal: input.dateRange.from } })
      }
      if (input.dateRange?.to) {
        conditions.push({ createdAt: { less_than_equal: input.dateRange.to } })
      }

      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        where: { and: conditions },
        sort: '-createdAt',
        limit: input.limit ?? 25,
      })

      const firstDoc = result.docs[0] as Record<string, unknown> | undefined
      const firstActor = (firstDoc?.['actor'] ?? {}) as Record<string, unknown>
      const actorName =
        typeof firstActor['userName'] === 'string'
          ? firstActor['userName']
          : queryingSelf
            ? (ctx.user?.name ?? actorId)
            : actorId

      return {
        actorId,
        actor: actorName,
        actionCount: result.totalDocs,
        actions: result.docs.map((doc) => formatAuditEvent(doc as Record<string, unknown>)),
      }
    },
  }
}

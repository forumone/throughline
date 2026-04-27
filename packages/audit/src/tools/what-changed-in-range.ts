import { z } from 'zod'
import type { Payload } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { deniedEnvelope, isAuditReader } from './access.js'

export interface WhatChangedInRangeDeps {
  payload: Payload
  collectionSlug: string
}

const inputSchema = z.object({
  from: z.string().datetime().describe('ISO-8601 start of range (inclusive).'),
  to: z.string().datetime().describe('ISO-8601 end of range (inclusive).'),
  scanLimit: z
    .number()
    .int()
    .positive()
    .max(5000)
    .optional()
    .describe('Max events to scan when computing the summary. Default: 1000.'),
})

export function createWhatChangedInRangeTool(
  deps: WhatChangedInRangeDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'what_changed_in_range',
    description:
      'Summarized activity over a time range, grouped by action type, actor, and target collection. Use for "what happened last week?" or weekly review questions. Returns counts and top contributors rather than individual events. Caps the scan at 1000 events by default — for wider sweeps, raise scanLimit or use query_audit with paging.',
    inputSchema,
    handler: async (input, ctx) => {
      if (!isAuditReader(ctx)) {
        return deniedEnvelope('Only admins and editors can summarize activity ranges.')
      }

      const scanLimit = input.scanLimit ?? 1000
      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        where: {
          and: [
            { createdAt: { greater_than_equal: input.from } },
            { createdAt: { less_than_equal: input.to } },
          ],
        },
        sort: '-createdAt',
        limit: scanLimit,
      })

      const byAction = new Map<string, number>()
      const byActor = new Map<string, { name: string; count: number }>()
      const byCollection = new Map<string, number>()
      const byServer = new Map<string, number>()
      let failureCount = 0

      for (const doc of result.docs as Array<Record<string, unknown>>) {
        const action = typeof doc['action'] === 'string' ? doc['action'] : 'unknown'
        byAction.set(action, (byAction.get(action) ?? 0) + 1)

        const actor = (doc['actor'] ?? {}) as Record<string, unknown>
        const actorId = typeof actor['userId'] === 'string'
          ? actor['userId']
          : typeof actor['type'] === 'string'
            ? actor['type']
            : 'unknown'
        const actorName = typeof actor['userName'] === 'string' ? actor['userName'] : actorId
        const existing = byActor.get(actorId)
        byActor.set(actorId, { name: actorName, count: (existing?.count ?? 0) + 1 })

        const targetCollection = doc['targetCollection']
        if (typeof targetCollection === 'string') {
          byCollection.set(targetCollection, (byCollection.get(targetCollection) ?? 0) + 1)
        }

        const server = typeof doc['mcpServer'] === 'string' ? doc['mcpServer'] : 'unknown'
        byServer.set(server, (byServer.get(server) ?? 0) + 1)

        if (doc['success'] === false) failureCount += 1
      }

      const totalDocs = result.totalDocs
      const truncated = totalDocs > result.docs.length

      return {
        from: input.from,
        to: input.to,
        totalActions: totalDocs,
        scanned: result.docs.length,
        truncated,
        ...(truncated
          ? {
              note: `Range contains ${totalDocs} events but only ${result.docs.length} were scanned for summary; raise scanLimit to widen the sweep.`,
            }
          : {}),
        failureCount,
        byAction: Object.fromEntries(
          Array.from(byAction.entries()).sort((a, b) => b[1] - a[1]),
        ),
        topActors: Array.from(byActor.entries())
          .map(([id, { name, count }]) => ({ id, name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        byCollection: Object.fromEntries(
          Array.from(byCollection.entries()).sort((a, b) => b[1] - a[1]),
        ),
        byServer: Object.fromEntries(
          Array.from(byServer.entries()).sort((a, b) => b[1] - a[1]),
        ),
      }
    },
  }
}

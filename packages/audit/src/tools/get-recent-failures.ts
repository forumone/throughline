import { z } from 'zod'
import type { Payload, Where } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { formatAuditEvent } from '../formatting/index.js'
import { deniedEnvelope, isAuditReader } from './access.js'

export interface GetRecentFailuresDeps {
  payload: Payload
  collectionSlug: string
}

const inputSchema = z.object({
  hours: z
    .number()
    .int()
    .positive()
    .max(24 * 30)
    .optional()
    .describe('How far back to scan, in hours. Default: 24.'),
  mcpServer: z
    .string()
    .optional()
    .describe('Filter to a specific server (e.g. "publishing", "integrations").'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Max results. Default: 25.'),
})

export function createGetRecentFailuresTool(
  deps: GetRecentFailuresDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'get_recent_failures',
    description:
      'Recent failed operations across all MCP servers. Use for "what broke recently?" or when diagnosing issues. Returns actions with success=false and their error messages, most recent first.',
    inputSchema,
    handler: async (input, ctx) => {
      if (!isAuditReader(ctx)) {
        return deniedEnvelope('Only admins and editors can review recent failures.')
      }

      const hours = input.hours ?? 24
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
      const conditions: Where[] = [
        { success: { equals: false } },
        { createdAt: { greater_than_equal: since } },
      ]
      if (input.mcpServer) conditions.push({ mcpServer: { equals: input.mcpServer } })

      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        where: { and: conditions },
        sort: '-createdAt',
        limit: input.limit ?? 25,
      })

      return {
        hoursScanned: hours,
        since,
        failureCount: result.totalDocs,
        failures: result.docs.map((doc) => formatAuditEvent(doc as Record<string, unknown>)),
      }
    },
  }
}

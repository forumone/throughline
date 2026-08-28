import { z } from 'zod'
import type { Payload, Where } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { formatAuditEvent } from '../formatting/index.js'
import { deniedEnvelope, isAuditReader } from './access.js'
import { AUDIT_TOOLS } from './descriptors.js'

export interface QueryAuditDeps {
  payload: Payload
  collectionSlug: string
}

const inputSchema = z.object({
  targetCollection: z
    .string()
    .optional()
    .describe('Filter to a specific collection (e.g. "pages").'),
  targetId: z.string().optional().describe('Filter to a specific document ID.'),
  actorId: z.string().optional().describe('Filter to a specific user ID.'),
  action: z
    .string()
    .optional()
    .describe('Filter to a specific action (e.g. "publishing.publish").'),
  mcpServer: z
    .string()
    .optional()
    .describe('Filter to a specific server (e.g. "publishing", "approvals").'),
  dateRange: z
    .object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    })
    .optional()
    .describe('ISO-8601 timestamps. Inclusive on both ends.'),
  onlyFailures: z
    .boolean()
    .optional()
    .describe('If true, only return actions where success=false.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Max results. Default: 20.'),
})

export function createQueryAuditTool(deps: QueryAuditDeps): McpToolDefinition<typeof inputSchema> {
  return {
    ...AUDIT_TOOLS.queryAudit,
    inputSchema,
    handler: async (input, ctx) => {
      if (!isAuditReader(ctx)) {
        return deniedEnvelope(
          'Only admins and editors can run general audit queries. Try `who_changed_what` for your own activity.',
        )
      }

      const conditions: Where[] = []
      if (input.targetCollection) conditions.push({ targetCollection: { equals: input.targetCollection } })
      if (input.targetId) conditions.push({ targetId: { equals: input.targetId } })
      if (input.actorId) conditions.push({ 'actor.userId': { equals: input.actorId } })
      if (input.action) conditions.push({ action: { equals: input.action } })
      if (input.mcpServer) conditions.push({ mcpServer: { equals: input.mcpServer } })
      if (input.onlyFailures) conditions.push({ success: { equals: false } })
      if (input.dateRange?.from) conditions.push({ createdAt: { greater_than_equal: input.dateRange.from } })
      if (input.dateRange?.to) conditions.push({ createdAt: { less_than_equal: input.dateRange.to } })

      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        ...(conditions.length > 0 ? { where: { and: conditions } } : {}),
        sort: '-createdAt',
        limit: input.limit ?? 20,
      })

      return {
        total: result.totalDocs,
        returned: result.docs.length,
        events: result.docs.map((doc) => formatAuditEvent(doc as Record<string, unknown>)),
      }
    },
  }
}

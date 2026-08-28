import { z } from 'zod'
import type { Payload } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { formatAuditEvent } from '../formatting/index.js'
import { deniedEnvelope, isAuditReader } from './access.js'
import { AUDIT_TOOLS } from './descriptors.js'

export interface GetChangeHistoryDeps {
  payload: Payload
  collectionSlug: string
}

const inputSchema = z.object({
  targetCollection: z.string().describe('Collection slug (e.g. "pages").'),
  targetId: z.string().describe('Document ID within the collection.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe('Max events to return. Default: 50.'),
})

export function createGetChangeHistoryTool(
  deps: GetChangeHistoryDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    ...AUDIT_TOOLS.getChangeHistory,
    inputSchema,
    handler: async (input, ctx) => {
      if (!isAuditReader(ctx)) {
        return deniedEnvelope('Only admins and editors can read a document\'s change history.')
      }

      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        where: {
          and: [
            { targetCollection: { equals: input.targetCollection } },
            { targetId: { equals: input.targetId } },
          ],
        },
        sort: '-createdAt',
        limit: input.limit ?? 50,
      })

      return {
        targetCollection: input.targetCollection,
        targetId: input.targetId,
        eventCount: result.totalDocs,
        history: result.docs.map((doc) => formatAuditEvent(doc as Record<string, unknown>)),
      }
    },
  }
}

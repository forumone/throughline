import { z } from 'zod'
import type { Payload } from 'payload'
import { withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { DEFAULT_APPROVALS_SLUG } from '../collection.js'
import type { ApprovalsPluginOptions } from '../options.js'
import { APPROVALS_TOOLS } from './descriptors.js'

export interface ListMyRequestsDeps {
  payload: Payload
  options: ApprovalsPluginOptions & { tokenSecret: string }
}

export function createListMyRequestsTool(deps: ListMyRequestsDeps): McpToolDefinition {
  const inputSchema = withMeta({
    status: z
      .enum(['pending', 'granted', 'declined', 'changes-requested', 'expired'])
      .optional()
      .describe('Filter by status. Defaults to all.'),
    limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .describe('Max results. Default: 25'),
  })

  return {
    ...APPROVALS_TOOLS.listMyRequests,
    inputSchema,
    handler: async (input, ctx) => {
      if (!ctx.user) return { error: 'Must be authenticated to list approval requests' }

      const result = await deps.payload.find({
        collection: deps.options.collectionSlug ?? DEFAULT_APPROVALS_SLUG,
        where: input.status
          ? {
              and: [
                { requestedBy: { equals: ctx.user.id } },
                { status: { equals: input.status } },
              ],
            }
          : { requestedBy: { equals: ctx.user.id } },
        limit: input.limit ?? 25,
        sort: '-requestedAt',
      })

      const docs = result.docs as Array<Record<string, unknown>>
      return {
        requests: docs.map((doc) => ({
          approvalId: String(doc['id']),
          status: doc['status'],
          targetCollection: doc['targetCollection'],
          targetId: doc['targetId'],
          targetTitle: doc['targetTitle'],
          requestedAt: doc['requestedAt'],
          decidedAt: doc['decidedAt'],
          decisionNotes: doc['decisionNotes'],
          expiresAt: doc['expiresAt'],
        })),
      }
    },
  }
}

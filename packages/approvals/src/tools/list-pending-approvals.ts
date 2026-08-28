import { z } from 'zod'
import type { Payload } from 'payload'
import { unwrapRelationshipId, withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { DEFAULT_APPROVALS_SLUG } from '../collection.js'
import type { ApprovalsPluginOptions } from '../options.js'
import { APPROVALS_TOOLS } from './descriptors.js'

export interface ListPendingApprovalsDeps {
  payload: Payload
  options: ApprovalsPluginOptions & { tokenSecret: string }
}

export function createListPendingApprovalsTool(
  deps: ListPendingApprovalsDeps,
): McpToolDefinition {
  const inputSchema = withMeta({
    limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .describe('Max results. Default: 25'),
  })

  return {
    ...APPROVALS_TOOLS.listPendingApprovals,
    inputSchema,
    handler: async (input, ctx) => {
      if (!ctx.user) return { error: 'Must be authenticated to list pending approvals' }
      const userGroups = ctx.user.groups
      if (userGroups.length === 0) return { pending: [] }

      const result = await deps.payload.find({
        collection: deps.options.collectionSlug ?? DEFAULT_APPROVALS_SLUG,
        where: {
          and: [
            { status: { equals: 'pending' } },
            { approverGroups: { in: userGroups } },
          ],
        },
        limit: input.limit ?? 25,
        sort: '-requestedAt',
      })

      const docs = result.docs as Array<Record<string, unknown>>
      return {
        pending: docs.map((doc) => ({
          approvalId: String(doc['id']),
          targetCollection: doc['targetCollection'],
          targetId: doc['targetId'],
          targetTitle: doc['targetTitle'],
          changesSummary: doc['changesSummary'],
          requestedBy: unwrapRelationshipId(doc['requestedBy']),
          requestedAt: doc['requestedAt'],
          expiresAt: doc['expiresAt'],
          previewUrl: doc['previewUrl'],
        })),
      }
    },
  }
}

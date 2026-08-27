import { z } from 'zod'
import type { Payload } from 'payload'
import { unwrapRelationshipId, withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { DEFAULT_APPROVALS_SLUG } from '../collection.js'
import type { ApprovalsPluginOptions } from '../options.js'

export interface GetApprovalStatusDeps {
  payload: Payload
  options: ApprovalsPluginOptions & { tokenSecret: string }
}

export function createGetApprovalStatusTool(deps: GetApprovalStatusDeps): McpToolDefinition {
  const inputSchema = withMeta({
    approvalId: z.string(),
  })

  return {
    name: 'get_approval_status',
    description:
      "Returns the current status of an approval request including who decided, when, and any notes. Read-only; no audit record is written.",
    inputSchema,
    handler: async (input) => {
      const approval = (await deps.payload.findByID({
        collection: deps.options.collectionSlug ?? DEFAULT_APPROVALS_SLUG,
        id: input.approvalId,
      })) as Record<string, unknown> | null
      if (!approval) return { error: 'Approval not found' }

      return {
        approvalId: String(approval['id']),
        status: approval['status'],
        targetCollection: approval['targetCollection'],
        targetId: approval['targetId'],
        targetTitle: approval['targetTitle'],
        targetVersion: approval['targetVersion'],
        requestedBy: unwrapRelationshipId(approval['requestedBy']),
        requestedAt: approval['requestedAt'],
        approverGroups: approval['approverGroups'],
        decidedBy: unwrapRelationshipId(approval['decidedBy']),
        decidedAt: approval['decidedAt'],
        decisionNotes: approval['decisionNotes'],
        expiresAt: approval['expiresAt'],
      }
    },
  }
}

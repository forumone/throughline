import { z } from 'zod'
import type { Payload } from 'payload'
import { auditContext } from '../../mcp/audit-context.js'
import { relationshipIdFor, unwrapRelationshipId } from '../../utils/relationships.js'
import { sendEventSafely } from '../../utils/send-event-safely.js'
import { withMeta } from '../../mcp/meta.js'
import { type AuditWriter } from '../../audit/writer.js'
import type { AuditAction } from '../../audit/types.js'
import type { McpToolDefinition } from '../../plugin-contract/mcp.js'
import { DEFAULT_APPROVALS_SLUG } from '../collection.js'
import type { ApprovalsPluginOptions } from '../options.js'
import { APPROVALS_TOOLS } from './descriptors.js'

export interface RespondToApprovalDeps {
  payload: Payload
  options: ApprovalsPluginOptions & { tokenSecret: string }
  auditWriter: AuditWriter
}

const decisionToStatus = {
  approve: 'granted',
  decline: 'declined',
  request_changes: 'changes-requested',
} as const

const decisionToAuditAction: Record<keyof typeof decisionToStatus, AuditAction> = {
  approve: 'approval.granted',
  decline: 'approval.declined',
  request_changes: 'approval.changes_requested',
}

export function createRespondToApprovalTool(deps: RespondToApprovalDeps): McpToolDefinition {
  const inputSchema = withMeta({
    approvalId: z.string(),
    decision: z.enum(['approve', 'decline', 'request_changes']),
    notes: z
      .string()
      .optional()
      .describe('Decision rationale, shown to the requester (optional but encouraged for declines)'),
  })

  return {
    ...APPROVALS_TOOLS.respondToApproval,
    requiredScope: 'approvals.decide',
    inputSchema,
    handler: async (input, ctx) => {
      if (!ctx.user) {
        return { error: 'Must be authenticated to respond to approvals' }
      }

      const collectionSlug = deps.options.collectionSlug ?? DEFAULT_APPROVALS_SLUG
      const approval = (await deps.payload.findByID({
        collection: collectionSlug,
        id: input.approvalId,
      })) as Record<string, unknown> | null

      if (!approval) return { error: 'Approval not found' }

      if (approval['status'] !== 'pending') {
        return { error: `Approval is already ${String(approval['status'])}` }
      }

      const requesterId = unwrapRelationshipId(approval['requestedBy'])
      if (requesterId === ctx.user.id) {
        return { error: 'You cannot approve your own request' }
      }

      const approverGroups = (approval['approverGroups'] as string[] | undefined) ?? []
      const userGroups = ctx.user.groups
      const hasAccess = approverGroups.some((g) => userGroups.includes(g))
      if (!hasAccess) {
        return { error: 'You are not in an approver group for this request' }
      }

      const decision = input.decision as keyof typeof decisionToStatus
      const newStatus = decisionToStatus[decision]
      const decidedAt = new Date().toISOString()

      await deps.payload.update({
        collection: collectionSlug,
        id: input.approvalId,
        data: {
          status: newStatus,
          decidedBy: relationshipIdFor(deps.payload, deps.options.usersSlug ?? 'users', ctx.user.id),
          decidedAt,
          ...(input.notes ? { decisionNotes: input.notes } : {}),
        },
      })

      // After the write, as in request_approval: the decision is recorded.
      const warning = await sendEventSafely(deps.options.inngest, {
        name: 'approval/decided',
        data: {
          approvalId: input.approvalId,
          decision: newStatus,
          decidedBy: ctx.user.id,
          decidedAt,
          targetCollection: String(approval['targetCollection']),
          targetId: String(approval['targetId']),
        },
      }, 'the requester may not have been notified, and the approval/decided subscribers have not run')

      await deps.auditWriter({
        ...auditContext(ctx, input._meta),
        action: decisionToAuditAction[decision],
        mcpServer: 'approvals',
        mcpTool: 'respond_to_approval',
        targetCollection: String(approval['targetCollection']),
        targetId: String(approval['targetId']),
        targetTitle:
          typeof approval['targetTitle'] === 'string'
            ? approval['targetTitle']
            : String(approval['targetId']),
        // The decision notes are the reasoning when there are any: they are
        // what the approver actually wrote.
        reasoning: input.notes ?? input._meta?.reasoning,
        approvalRequestId: input.approvalId,
        success: true,
      })

      return { success: true, status: newStatus, decidedAt, ...(warning ? { warnings: [warning] } : {}) }
    },
  }
}

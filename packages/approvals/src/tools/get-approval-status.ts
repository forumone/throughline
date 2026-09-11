import { z } from 'zod'
import type { Payload } from 'payload'
import { unwrapRelationshipId, withMeta } from '@forumone/throughline-core'
import type { McpToolContext, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { DEFAULT_APPROVALS_SLUG } from '../collection.js'
import type { ApprovalsPluginOptions } from '../options.js'
import { APPROVALS_TOOLS } from './descriptors.js'

export interface GetApprovalStatusDeps {
  payload: Payload
  options: ApprovalsPluginOptions & { tokenSecret: string }
}

/*
Who may read one approval by id.

Audit 04 F-20. This handler was `async (input) =>` — the signature did not
accept `ctx` at all, so there was nothing to check against and nothing was
checked. It `findByID`s an arbitrary `approvalId` at the Local API default of
`overrideAccess: true` and returns the target, the requester, the approver
groups, the decision and the decision notes.

The other four tools on this server all refuse an unauthenticated caller. This
was the one that still answered when they denied, and that asymmetry is not
theoretical: `@payloadcms/plugin-mcp` never assigns `req.user`, so for a
`Bearer`-authenticated MCP call `ctx.user` is null and the refusal below is the
branch that actually fires today.

## The rule is the union of the two list tools, and deliberately nothing more

`list_my_requests` shows a caller the approvals they requested.
`list_pending_approvals` shows a caller the approvals routed to one of their
groups. Between them they already disclose every field this tool returns. So
the rule here is *requester or approver-group member*, which makes the by-id
read agree with the by-list reads rather than being a way around them.

No admin bypass, because `respond_to_approval` has none either and a second
policy on the same collection is how the two drift. An admin who needs an
arbitrary approval has the admin UI and the REST collection, both of which
apply `approval-requests`' own access rules — which is the thing this server
should not be quietly wider than.

The order of the three checks is load-bearing. Identity first, because the
unauthenticated refusal must not depend on the id existing; then the document;
then membership.
*/

/**
 * Whether this caller is a party to this approval.
 *
 * Group membership is compared exactly as `respond_to_approval` compares it —
 * `approverGroups` against `ctx.user.groups`, slug by slug — so a change in how
 * groups are named breaks both together rather than leaving this one behind.
 */
function isPartyTo(
  approval: Record<string, unknown>,
  user: NonNullable<McpToolContext['user']>,
): boolean {
  if (unwrapRelationshipId(approval['requestedBy']) === user.id) return true

  const approverGroups = (approval['approverGroups'] as string[] | undefined) ?? []
  return approverGroups.some((group) => user.groups.includes(group))
}

export function createGetApprovalStatusTool(deps: GetApprovalStatusDeps): McpToolDefinition {
  const inputSchema = withMeta({
    approvalId: z.string(),
  })

  return {
    ...APPROVALS_TOOLS.getApprovalStatus,
    inputSchema,
    handler: async (input, ctx) => {
      if (!ctx.user) {
        return { error: 'Must be authenticated to read an approval request' }
      }

      const approval = (await deps.payload.findByID({
        collection: deps.options.collectionSlug ?? DEFAULT_APPROVALS_SLUG,
        id: input.approvalId,
      })) as Record<string, unknown> | null
      if (!approval) return { error: 'Approval not found' }

      /*
      The same sentence as "not found", and that is the point: a caller who is
      not a party to this request learns nothing about whether the id names one.
      Ids are sequential, so a distinguishable refusal enumerates the collection.
      */
      if (!isPartyTo(approval, ctx.user)) return { error: 'Approval not found' }

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

import type { McpToolDescriptor } from '@forumone/throughline-core'

/*
This server's tools, by name and description, knowable without a Payload.

`@payloadcms/plugin-mcp` reads exactly these two fields while the host's config
is being built, to generate one per-key checkbox per tool, and denies any tool it
has no checkbox for. The handlers close over `payload` and the audit writer, so
they cannot exist that early — the names never needed to wait for them.

The factories below spread these, so the two cannot drift.
*/
export const APPROVALS_TOOLS = {
  requestApproval: {
    name: 'request_approval',
    description:
      'Kicks off the approval workflow for a document that requires approval before publishing. Provide a clear changesSummary explaining what changed and why; approvers see this in their notifications. Returns the approval ID, expiration time, and the list of approvers who were notified.',
  },
  respondToApproval: {
    name: 'respond_to_approval',
    description:
      "Records an approver's decision on a pending approval. Valid decisions: approve, decline, request_changes. Approvers can also act through the inline action links in their notification emails; this tool is for when they respond conversationally through Claude.",
  },
  getApprovalStatus: {
    name: 'get_approval_status',
    description:
      'Returns the current status of an approval request including who decided, when, and any notes. Read-only; no audit record is written.',
  },
  listPendingApprovals: {
    name: 'list_pending_approvals',
    description:
      "Returns pending approval requests routed to one of the caller's approver groups. Use to answer 'what do I need to review?'. Read-only.",
  },
  listMyRequests: {
    name: 'list_my_requests',
    description:
      "Returns approval requests the current user has submitted, optionally filtered by status. Use to answer 'what's the state of my pending approvals?'. Read-only.",
  },
} as const satisfies Record<string, McpToolDescriptor>

/** Every tool this server contributes, for the collector. */
export const APPROVALS_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] =
  Object.values(APPROVALS_TOOLS)

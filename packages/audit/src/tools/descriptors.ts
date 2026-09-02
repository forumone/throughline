import type { McpToolDescriptor } from '@forumone/throughline-core'

/*
This server's tools, by name and description, knowable without a Payload.

`@payloadcms/plugin-mcp` reads exactly these two fields while the host's config
is being built, to generate one per-key checkbox per tool, and denies any tool it
has no checkbox for. The handlers close over `payload`, so they cannot exist that
early — the names never needed to wait for them.

The factories below spread these, so the two cannot drift.
*/
export const AUDIT_TOOLS = {
  queryAudit: {
    name: 'query_audit',
    description:
      "General-purpose audit log query. Filter by collection, document, actor, action, server, date range, or failure-only. Returns chronologically ordered results, most recent first. Use when you need a custom view of system activity that doesn't fit the more specific tools.",
  },
  getChangeHistory: {
    name: 'get_change_history',
    description:
      'Returns the complete chronological history of actions on a single document, including diffs. Use to answer "what has happened to this page?" or "who changed X?". Most-recent first.',
  },
  whoChangedWhat: {
    name: 'who_changed_what',
    description:
      "A user's recent activity. Use when someone asks 'what has Sarah been working on?' or 'show me my changes today'. If actorId is omitted, defaults to the authenticated caller — so users can ask about themselves without knowing their ID. Other users' activity requires admin/editor.",
  },
  whatChangedInRange: {
    name: 'what_changed_in_range',
    description:
      'Summarized activity over a time range, grouped by action type, actor, and target collection. Use for "what happened last week?" or weekly review questions. Returns counts and top contributors rather than individual events. Caps the scan at 1000 events by default — for wider sweeps, raise scanLimit or use query_audit with paging.',
  },
  getRecentFailures: {
    name: 'get_recent_failures',
    description:
      'Recent failed operations across all MCP servers. Use for "what broke recently?" or when diagnosing issues. Returns actions with success=false and their error messages, most recent first.',
  },
} as const satisfies Record<string, McpToolDescriptor>

/** Every tool this server contributes, for the collector. */
export const AUDIT_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] = Object.values(AUDIT_TOOLS)

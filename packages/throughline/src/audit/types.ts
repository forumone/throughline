/**
 * Canonical action names for the audit log. Every server package picks
 * actions from this list rather than introducing free-form strings, so
 * audit queries (C8) can build on a known taxonomy.
 */
export const AUDIT_ACTIONS = [
  'content.find',
  'content.create',
  'content.update',
  'content.delete',
  'design.list',
  'design.suggest',
  'design.validate',
  'design.get_contract',
  'design.find_anti_pattern',
  'publishing.draft',
  'publishing.publish',
  'publishing.unpublish',
  'publishing.schedule',
  'publishing.rollback',
  'approval.requested',
  'approval.granted',
  'approval.declined',
  'approval.changes_requested',
  'approval.expired',
  'approval.discussed',
  'form.created',
  'form.updated',
  'form.submission_received',
  'integration.synced',
  'integration.failed',
  'system.error',
  'system.healthcheck',
  'mcp.connected',
  'mcp.disconnected',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/**
 * MCP server identifiers: the `mcp_server` enum on the audit collection. A
 * value added here is a migration in every host, so new values go at the end.
 * The last four arrived in 1.1, so that a throw in those tools is recorded as a
 * `system.error` like everyone else's.
 */
export const AUDIT_MCP_SERVERS = [
  'payload',
  'component',
  'publishing',
  'approvals',
  'audit',
  'forms',
  'integrations',
  'editorial',
  'references',
  'fields',
  'observability',
  'content',
] as const

export type AuditMcpServer = (typeof AUDIT_MCP_SERVERS)[number]

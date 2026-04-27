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
  'form.submission_received',
  'integration.synced',
  'integration.failed',
  'system.error',
  'system.healthcheck',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/** MCP server identifiers. Keep in sync with the planned server packages. */
export const AUDIT_MCP_SERVERS = [
  'payload',
  'component',
  'publishing',
  'approvals',
  'audit',
  'forms',
  'integrations',
] as const

export type AuditMcpServer = (typeof AUDIT_MCP_SERVERS)[number]

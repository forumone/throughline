export { auditPlugin, getAuditWriter } from './plugin.js'
export type { AuditPluginOptions } from './plugin.js'

export { createAuditCollection, DEFAULT_AUDIT_SLUG } from './collection.js'
export type { AuditCollectionOptions } from './collection.js'

export { createAuditWriter } from './writer.js'
export type { AuditWriter, AuditWriterOptions, AuditEventInput, AuditActor } from './writer.js'

export { AUDIT_ACTIONS, AUDIT_MCP_SERVERS } from './types.js'
export type { AuditAction, AuditMcpServer } from './types.js'

// The job that fans an audit event out to its follow-ons (approval emails).
export { auditEventEchoJob } from './jobs/audit-event-echo.js'
export type {
  AuditEchoEvent,
  AuditEchoHandler,
  AuditEventEchoOptions,
} from '../jobs/workflow-types.js'

// From @forumone/throughline-audit (index.ts).
export { auditQueryPlugin } from './query/plugin.js'
export type { AuditQueryPluginOptions } from './query/options.js'

export { formatAuditEvent, formatRelativeTime } from './query/formatting/index.js'
export type { FormattedAuditEvent } from './query/formatting/index.js'

export {
  createQueryAuditTool,
  createGetChangeHistoryTool,
  createWhoChangedWhatTool,
  createWhatChangedInRangeTool,
  createGetRecentFailuresTool,
} from './query/tools/index.js'

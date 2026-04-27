// Plugin and surface types are re-exported here as they are added during C8.

export type { AuditQueryPluginOptions } from './options.js'
export { DEFAULT_AUDIT_COLLECTION_SLUG } from './options.js'

export { formatAuditEvent, formatRelativeTime } from './formatting/index.js'
export type { FormattedAuditEvent } from './formatting/index.js'

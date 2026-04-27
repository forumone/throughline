import type { PayloadRequest } from 'payload'
import type { BaseCorePluginOptions } from '@forumone/throughline-plugin-contract'

export interface AuditQueryPluginOptions extends BaseCorePluginOptions {
  /**
   * Override the audit collection slug. Must match the slug `auditPlugin`
   * (in `@forumone/throughline-core`) writes to. Default: `'audit-events'`.
   */
  collectionSlug?: string
  /**
   * Custom access-control function for read operations. Returns true to
   * allow reads. Defaults to admin and editor roles.
   */
  readAccess?: (req: PayloadRequest) => boolean
}

export const DEFAULT_AUDIT_COLLECTION_SLUG = 'audit-events'

/**
 * Validates options at load time. Currently a passthrough; reserved for
 * future option-shape additions so callers always go through the same gate.
 */
export function validateOptions(options: AuditQueryPluginOptions): AuditQueryPluginOptions {
  return options
}

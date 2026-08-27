import type { McpToolCollector } from '@forumone/throughline-core'
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

  /**
   * Where to put this server's MCP tools so Payload's own MCP plugin can serve
   * them.
   *
   * `createMcpToolCollector()` from `@forumone/throughline-core`. The host hands
   * its array to `@payloadcms/plugin-mcp` at config time and this plugin fills
   * it at `onInit` — which is the first moment the tools can exist, since they
   * close over `payload`, and still before any request reads the array.
   *
   * Omit it and nothing changes: this server keeps its own `/mcp` endpoint,
   * which is what lets a host move one server at a time.
   */
  mcpTools?: McpToolCollector
}

export const DEFAULT_AUDIT_COLLECTION_SLUG = 'audit-events'

/**
 * Validates options at load time. Currently a passthrough; reserved for
 * future option-shape additions so callers always go through the same gate.
 */
export function validateOptions(options: AuditQueryPluginOptions): AuditQueryPluginOptions {
  return options
}

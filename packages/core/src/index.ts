// Subsystems are re-exported as they are added during C4. The aggregated
// surface here mirrors the package's `./<subpath>` exports.

export {
  AUDIT_ACTIONS,
  AUDIT_MCP_SERVERS,
  DEFAULT_AUDIT_SLUG,
  auditPlugin,
  createAuditCollection,
  createAuditWriter,
  getAuditWriter,
} from './audit/index.js'
export type {
  AuditAction,
  AuditActor,
  AuditCollectionOptions,
  AuditEventInput,
  AuditMcpServer,
  AuditPluginOptions,
  AuditWriter,
  AuditWriterOptions,
} from './audit/index.js'

export {
  DEFAULT_API_KEYS_SLUG,
  createApiKeysCollection,
  createBearerTokenAuthenticator,
  generateApiKey,
  sha256Hex,
} from './auth/index.js'
export type { ApiKeysCollectionOptions, BearerTokenAuthenticatorOptions } from './auth/index.js'

export { ENV_VARS, validateBaseEnv, requireEnv, optionalEnv } from './env/index.js'
export type { EnvVarName, BaseEnv } from './env/index.js'

export { defaultLogger, createNamedLogger } from './logger/index.js'

export { shallowDiff, generateId } from './utils/index.js'

// Re-export plugin contract types so consumers do not have to import the
// contract package separately for the common ones.
export type {
  AuthenticatedUser,
  BaseCorePluginOptions,
  CorePlugin,
  Logger,
  McpAuthResult,
  McpAuthenticator,
  McpToolContext,
  McpToolDefinition,
  PluginRegistry,
  PluginRegistryEntry,
} from '@forumone/throughline-plugin-contract'

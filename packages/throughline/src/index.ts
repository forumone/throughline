// `@forumone/throughline`: what every part of the suite shares. Each plugin
// lives on its own subpath (`/audit`, `/media`, `/fields`, `/observability`,
// …); docs/spec/1.0-exports.md maps every 0.x import to its 1.0 one.

export { EnvironmentError, assertEnvironment, checkEnvValue } from './env/index.js'
export type { EnvValueProblem, EnvironmentCheck } from './env/index.js'

// What a site needs to write an MCP tool of its own.
export {
  MCP_API_KEYS_SLUG,
  McpMetaSchema,
  auditContext,
  deniedEnvelope,
  isMcpApiKeyPrincipal,
  isSignedIn,
  mcpApiKeyAccess,
  signedIn,
  withMeta,
} from './mcp/index.js'
export type { AuditContextFields, McpMeta } from './mcp/index.js'

// The collector, until `throughline()` wires it and it becomes internal.
export { createMcpToolCollector, toPayloadMcpTool, toPayloadMcpTools } from './mcp/index.js'
export type {
  AddToolsOptions,
  CreateMcpToolCollectorOptions,
  DeclareToolsOptions,
  McpToolCollector,
  McpToolDescriptor,
  PayloadMcpRequest,
  PayloadMcpTool,
  ToPayloadMcpToolOptions,
} from './mcp/index.js'

export { defaultLogger, createNamedLogger } from './logger/index.js'

export { LOCKED_DOCUMENTS_SLUG, hardenCoreCollections } from './access/coreCollections.js'
export type { HardenCoreCollectionsOptions } from './access/coreCollections.js'

export {
  documentContentHash,
  formatZodIssues,
  sha256Hex,
  unwrapRelationshipId,
} from './utils/index.js'
export type { DocumentContentHashOptions } from './utils/index.js'

// The types a plugin is written against.
export type {
  AuthenticatedUser,
  BaseCorePluginOptions,
  CollectionPluginOptions,
  CorePlugin,
  EnvRequirement,
  Logger,
  McpToolContext,
  McpToolDefinition,
  PluginAdminGroup,
  PluginAdminOptions,
} from './plugin-contract/index.js'

/**
 * @internal The plugin registry and admin-group helpers. Public only while
 * plugins still ship as separate packages that need them; `throughline()`
 * owns the registration order once they have all moved in.
 */
export {
  DEFAULT_ADMIN_GROUP,
  getPluginRegistry,
  resolveAdminGroup,
} from './plugin-contract/index.js'
/** @internal See `getPluginRegistry`. */
export type { PluginRegistry, PluginRegistryEntry } from './plugin-contract/index.js'

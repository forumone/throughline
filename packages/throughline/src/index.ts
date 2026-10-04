// `@forumone/throughline`: `throughline()`, and what every part of the suite
// shares. Each plugin lives on its own subpath (`/publishing`, `/audit`,
// `/media`, …); docs/spec/1.0-exports.md maps every 0.x import to its 1.0 one.

// One call for the whole suite; docs/spec/1.0-throughline-call.md.
export { publishScheduledThroughPipeline, throughline } from './throughline.js'
export { AUTHORING_TOOLS, OPS_TOOL_NAMES } from './authoring/descriptors.js'
export { AUTHORING_PROMPTS } from './authoring/prompts.js'
export type { PayloadMcpPrompt } from './authoring/prompts.js'
export { createAuthoringTools, defaultCanPublish } from './authoring/tools.js'
export type { AuthoringDeps } from './authoring/tools.js'
export type {
  ThroughlineOptions,
  ThroughlinePublishingOptions,
  ThroughlineSuite,
} from './throughline.js'

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
export type { AuditContextFields, McpApiKeyAccessOptions, McpMeta } from './mcp/index.js'

// The shape of `suite.mcpTools`, and of the collector each plugin's `mcpTools`
// option takes. `throughline()` builds the collector; nothing else needs to.
export type { McpToolCollector, PayloadMcpTool } from './mcp/index.js'

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

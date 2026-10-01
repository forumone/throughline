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

export { EnvironmentError, assertEnvironment, checkEnvValue } from './env/index.js'
export type { EnvValueProblem, EnvironmentCheck } from './env/index.js'

export { createInngestClient } from './events/index.js'
export type { CoreEvents, FrameworkEvents, InngestClientOptions } from './events/index.js'

export {
  MCP_API_KEYS_SLUG,
  McpMetaSchema,
  auditContext,
  deniedEnvelope,
  createMcpToolCollector,
  isMcpApiKeyPrincipal,
  isSignedIn,
  mcpApiKeyAccess,
  signedIn,
  toPayloadMcpTool,
  toPayloadMcpTools,
  withMeta,
} from './mcp/index.js'
export type {
  AddToolsOptions,
  AuditContextFields,
  CreateMcpToolCollectorOptions,
  DeclareToolsOptions,
  McpMeta,
  McpToolCollector,
  McpToolDescriptor,
  PayloadMcpRequest,
  PayloadMcpTool,
  ToPayloadMcpToolOptions,
} from './mcp/index.js'

export { defaultLogger, createNamedLogger } from './logger/index.js'

export {
  DEFAULT_JOB_FAILURES_SLUG,
  DEFAULT_REPORTED_HEADERS,
  ERROR_WEBHOOK_URL_ENV,
  JOB_FAILURE_KINDS,
  NEVER_REPORTED_HEADERS,
  buildHealthcheckFailureReport,
  buildJobFailureReport,
  buildRequestErrorReport,
  clientPrefix,
  createErrorReporter,
  createJobFailureWriter,
  createJobFailuresCollection,
  currentDeployment,
  describeErrorReporting,
  getJobFailureWriter,
  jobFailuresPlugin,
  reportError,
  summariseReport,
} from './observability/index.js'
export type {
  BuildJobFailureReportInput,
  BuildRequestErrorReportOptions,
  ErrorReport,
  ErrorReporter,
  ErrorReporterOptions,
  HealthcheckFailureReport,
  JobFailureKind,
  JobFailureReport,
  JobFailureWriter,
  JobFailureWriterOptions,
  JobFailuresCollectionOptions,
  JobFailuresPluginOptions,
  ReportDeployment,
  ReportableHeaders,
  RequestErrorReport,
} from './observability/index.js'

export {
  documentContentHash,
  formatZodIssues,
  sha256Hex,
  unwrapRelationshipId,
} from './utils/index.js'
export type { DocumentContentHashOptions } from './utils/index.js'

// Re-export plugin contract types so consumers do not have to import the
// contract package separately for the common ones.
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
  PluginRegistry,
  PluginRegistryEntry,
} from '@forumone/throughline-plugin-contract'

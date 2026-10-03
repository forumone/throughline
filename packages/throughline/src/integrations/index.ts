/**
 * `@forumone/throughline/integrations`: the integrations plugin and registry,
 * the webhook integration, manual sync, their MCP tools, and the healthcheck
 * job. Was `@forumone/throughline-integrations` in 0.x.
 */
export {
  createManifestReachableCheck,
  createPayloadReachableCheck,
  healthcheckJob,
} from './jobs/healthcheck.js'
export type {
  HealthcheckDefinition,
  HealthcheckOptions,
  HealthcheckResult,
} from '../jobs/workflow-types.js'

export {
  integrationsJobs,
  integrationsPlugin,
  getIntegrationRegistry,
  getIntegrationContext,
} from './plugin.js'
export { IntegrationRegistry } from './registry.js'
export { DEFAULT_INTEGRATIONS_SLUG } from './options.js'
export type { IntegrationsPluginOptions } from './options.js'

export { webhookIntegration, WEBHOOK_INTEGRATION_ID } from './integrations/index.js'
export type { WebhookConfig } from './integrations/index.js'

export type {
  Integration,
  IntegrationCategory,
  IntegrationContext,
  IntegrationAuditEvent,
  IntegrationConfigValidation,
  IntegrationHealth,
  IntegrationInstance,
  IntegrationInstanceLoaded,
  IntegrationStatusUpdate,
  IntegrationSyncStatus,
} from './types.js'

export {
  problemReport,
  statusFromProblems,
  DEFAULT_PROBLEM_REPORT_LENGTH,
} from './sync/problems.js'
export type { ProblemReportOptions } from './sync/problems.js'

export { requestManualSync, MANUAL_SYNC_EVENT } from './sync/manual-sync.js'
export type {
  ManualSyncRefusal,
  RequestManualSyncArgs,
  RequestManualSyncDeps,
  RequestManualSyncResult,
} from './sync/manual-sync.js'

export { createSyncEndpoint, ADMIN_TRIGGER_REASON } from './endpoints/sync.js'
export type { CreateSyncEndpointDeps } from './endpoints/sync.js'

export {
  createListIntegrationsTool,
  createGetIntegrationStatusTool,
  createTriggerSyncTool,
  createTestIntegrationTool,
  createListIntegrationTypesTool,
} from './tools/index.js'

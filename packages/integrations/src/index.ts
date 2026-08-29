export {
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
  IntegrationSyncStatus,
} from './types.js'

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

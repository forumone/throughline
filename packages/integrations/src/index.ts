// Plugin and other surface exports land in later commits.

export { IntegrationRegistry } from './registry.js'
export { DEFAULT_INTEGRATIONS_SLUG } from './options.js'
export type { IntegrationsPluginOptions } from './options.js'
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

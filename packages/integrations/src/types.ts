import type { Field } from 'payload'
import type { Inngest } from 'inngest'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'

export type IntegrationCategory =
  | 'crm'
  | 'marketing'
  | 'analytics'
  | 'webhook'
  | 'storage'
  | 'messaging'
  | 'other'

export type IntegrationSyncStatus = 'success' | 'partial' | 'failed' | 'never-run'

export interface IntegrationConfigValidation {
  ok: boolean
  reason?: string
}

export interface IntegrationHealth {
  ok: boolean
  details?: string
}

/**
 * The contract every integration module satisfies. Integrations are
 * registered with the plugin and instantiated per-row via the Integrations
 * collection. The contract is intentionally small: every future integration
 * (Salesforce, Mailchimp, etc.) follows the same shape, so the productivity
 * compounding is in keeping it stable.
 *
 * Integrations are events-in, events-out: they subscribe to system events
 * (e.g. `content/page.published`) via Inngest functions returned by
 * {@link Integration.createFunctions} and emit their own results events as
 * needed. They never call other integrations directly.
 */
export interface Integration<Config = Record<string, unknown>, Fn = unknown> {
  /** Unique slug. Used as the `integrationType` value in the collection. */
  id: string
  /** Display name shown in the admin and `list_integration_types`. */
  name: string
  /** One-line description for the admin and the listing tool. */
  description: string
  /** Category for organizational grouping. */
  category: IntegrationCategory
  /**
   * Payload field definitions shown in the admin under each instance's
   * `config` group. Integration authors keep this small and obvious — Claude
   * cannot edit these (admin-only access) so unhelpful labels become support
   * tickets, not chatbot mistakes.
   */
  configFields: Field[]
  /**
   * Validates a config object against this integration's requirements. Run
   * by the collection's beforeChange hook so the Payload UI surfaces errors
   * inline rather than failing at sync time.
   */
  validateConfig: (config: Config) => Promise<IntegrationConfigValidation>
  /** Which system events this integration subscribes to. Documentation only. */
  subscribes: Array<{ event: string; purpose: string }>
  /**
   * Factory for the Inngest functions this integration contributes. Called
   * during plugin init; the returned functions are exposed via the registry
   * so the client app's Inngest endpoint can serve them. See
   * `docs/integrations-wiring.md`.
   *
   * **Generic in the function type, and `unknown` by default, on purpose.**
   * This plugin never inspects or invokes what comes back — the one use
   * anywhere is `.length`, for a log line saying how many an integration
   * contributed. The host serves them.
   *
   * Naming `InngestFunction.Any` here instead cost a consumer two casts. A host
   * whose dependency graph resolves a different `inngest` instance — pnpm keys
   * one by its peer set, and `inngest` has optional peers on `express`, `hono`
   * and `next`, so installing anything that pulls one in is enough — got a type
   * that is structurally identical and nominally different. Generic, the host's
   * own `InngestFunction.Any` flows through and the question never arises:
   *
   * ```ts
   * export const myIntegration: Integration<MyConfig, InngestFunction.Any> = { … }
   * ```
   */
  createFunctions: (ctx: IntegrationContext) => Fn[]
  /**
   * Optional MCP tools the integration adds to the integrations server. Most
   * integrations need only the five built-in tools; this is for cases where
   * the integration needs its own purpose-built tool (e.g. Salesforce's
   * "preview field mapping").
   */
  mcpTools?: (ctx: IntegrationContext) => McpToolDefinition[]
  /**
   * Health check. Called by the `test_integration` MCP tool. Returns
   * `{ ok: true }` for healthy or `{ ok: false, details }` for problems.
   */
  healthcheck?: (config: Config) => Promise<IntegrationHealth>
}

/**
 * Runtime context passed to integrations during initialization. Provides
 * the framework's facilities (Inngest, audit) without coupling the
 * integration to internal implementation details.
 */
export interface IntegrationContext {
  inngest: Inngest
  integrationsCollectionSlug: string
  /** Loads all enabled instances of an integration by id. */
  loadInstances: <Config = Record<string, unknown>>(
    integrationId: string,
  ) => Promise<Array<IntegrationInstanceLoaded<Config>>>
  /** Updates an instance's lastSyncAt / lastSyncStatus / lastError. */
  updateStatus: (
    instanceId: string,
    status: IntegrationSyncStatus,
    error?: string,
  ) => Promise<void>
  /** Writes an audit event. Thin wrapper over core's audit writer. */
  recordAudit: (event: IntegrationAuditEvent) => Promise<void>
}

export interface IntegrationInstanceLoaded<Config = Record<string, unknown>> {
  id: string
  name: string
  config: Config
}

export interface IntegrationAuditEvent {
  /** The integration's id (e.g. 'webhook'). Used as the audit `integrationId`. */
  integrationId: string
  /** The instance's display name. Surfaces in audit summaries. */
  instanceName: string
  action: 'integration.synced' | 'integration.failed'
  summary: string
  errorMessage?: string
}

/**
 * The shape of a single Integrations-collection row, as returned by Payload.
 * Used by tests and by the helpers that read instances back out.
 */
export interface IntegrationInstance {
  id: string
  name: string
  integrationType: string
  enabled: boolean
  config: Record<string, unknown>
  lastSyncAt?: string
  lastSyncStatus?: IntegrationSyncStatus
  lastError?: string
}

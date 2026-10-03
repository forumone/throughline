import type { Field } from 'payload'
import type { Inngest } from 'inngest'
import type { Job, JobContext } from '../jobs/types.js'
import type { WorkflowFailureHandler } from '../jobs/workflow-types.js'
import type { McpToolDefinition } from '../plugin-contract/mcp.js'

export type IntegrationCategory =
  | 'crm'
  | 'marketing'
  | 'analytics'
  | 'webhook'
  | 'storage'
  | 'messaging'
  | 'other'

export type IntegrationSyncStatus = 'success' | 'partial' | 'failed' | 'never-run'

/**
 * The status and message arguments of {@link IntegrationContext.updateStatus}.
 *
 * A run that was not clean has to say why: `partial` and `failed` carry a
 * message, and `success` carries none. `never-run` is not here because a run
 * that reports its status has run.
 */
export type IntegrationStatusUpdate =
  | [status: 'success']
  | [status: 'partial' | 'failed', error: string]

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
 * (e.g. `content/page.published`) through the jobs returned by
 * {@link Integration.createJobs} and emit their own results events as
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
   * The 0.x shape: Inngest functions, for a site that registers
   * `integrationsPlugin` by hand with an Inngest client and serves them itself.
   * Optional, and not called under `throughline()`, which runs `createJobs`.
   * Derive it from `createJobs` if you keep it, as the webhook does.
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
  createFunctions?: (ctx: IntegrationContext) => Fn[]
  /**
   * The integration's work, as runner-neutral jobs, on Inngest or Payload
   * Jobs. `throughline()` requires it, and puts what it returns in
   * `suite.jobs`. Optional in the type only so a 0.x integration with nothing
   * but `createFunctions` still typechecks under a hand-wired plugin.
   *
   * Takes a function rather than a context, because a jobs adapter is handed
   * its jobs while the config is being built, before the context exists. Call
   * `getContext(jobContext)` inside the handler. An integration with both
   * usually derives `createFunctions` from this, as the webhook does:
   *
   * ```ts
   * createFunctions: (ctx) => inngestJobs(ctx.inngest).functions(createJobs(() => ctx)),
   * ```
   */
  createJobs?: (getContext: (job: JobContext) => IntegrationContext) => Job[]
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
  /**
   * The Inngest client. On a site that runs integrations as jobs and has no
   * Inngest, any use of it throws, saying so. Send events with `emit`.
   */
  inngest: Inngest
  /** Send an event on whichever runner the site uses. */
  emit: (event: { name: string; data: unknown }) => Promise<void>
  /**
   * The site's terminal-failure handler, for an integration's Inngest functions:
   * `inngestJobs(ctx.inngest, { onFailure: ctx.onFailure })`. On Payload Jobs
   * the adapter's own `onFailure` applies instead.
   */
  onFailure?: WorkflowFailureHandler
  integrationsCollectionSlug: string
  /** Loads all enabled instances of an integration by id. */
  loadInstances: <Config = Record<string, unknown>>(
    integrationId: string,
  ) => Promise<Array<IntegrationInstanceLoaded<Config>>>
  /**
   * Records the outcome of a run on the instance: `lastSyncAt`,
   * `lastSyncStatus`, and `lastError`.
   *
   * `success` takes no message and clears `lastError`. `partial` and `failed`
   * require one, and it replaces `lastError`, so the admin always shows why
   * the run was not clean. For a run with per-record failures, build the
   * arguments from the list of failures with `statusFromProblems`:
   *
   * ```ts
   * await ctx.updateStatus(instance.id, ...statusFromProblems(problems))
   * ```
   */
  updateStatus: (instanceId: string, ...update: IntegrationStatusUpdate) => Promise<void>
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

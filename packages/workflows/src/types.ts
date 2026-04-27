import type { Inngest } from 'inngest'
import type { Payload } from 'payload'

/**
 * Common dependencies for workflow factories. Every factory takes an
 * Inngest client and a Payload instance — the workflows-as-factories shape
 * means the client app is responsible for instantiating both and passing
 * them in.
 */
export interface BaseWorkflowOptions {
  inngest: Inngest
  payload: Payload
}

export interface RevalidatePathsInput {
  /** A page path (`/about`, `/blog/post-1`, or `''` for layout-level only). */
  path: string
  /** Tag list passed through to Next.js's `revalidateTag`. */
  tags: string[]
}

export type RevalidateFn = (input: RevalidatePathsInput) => Promise<void>

export interface RevalidateOnPublishOptions extends BaseWorkflowOptions {
  /**
   * Custom revalidation function. Defaults to Next.js `revalidatePath` +
   * `revalidateTag` (loaded via dynamic import so non-Next.js consumers
   * don't fail to import the package). Supply your own for non-Next.js
   * frontends or richer cache invalidation.
   */
  revalidate?: RevalidateFn
  /**
   * Per-collection URL builders. Built-in defaults: pages → /slug
   * (with `home` mapped to `/`), posts → /blog/slug. Other collections
   * fall back to /<slug> unless you provide a builder.
   */
  urlBuilders?: Record<string, (slug: string) => string>
  /**
   * Per-collection cache tags. Defaults to `[<collection>]`. Multiple tags
   * supported for collections that participate in shared listings (e.g.
   * `programs` → `['programs', 'sitemap']`).
   */
  collectionTags?: Record<string, string[]>
  /**
   * Override the function id. Default: `revalidate-on-publish`.
   * Useful if multiple instances of the workflow run in the same Inngest
   * deployment (rare).
   */
  id?: string
}

export interface ScheduledCollectionConfig {
  slug: string
  /**
   * Field name carrying the publish status. Default: `_status`.
   * Override only if the collection uses a non-default status field.
   */
  statusField?: string
  /**
   * Field name carrying the scheduled-publish timestamp. Default: `scheduledPublishAt`.
   */
  scheduledField?: string
}

export interface ExecuteScheduledPublishesOptions extends BaseWorkflowOptions {
  /** Collections that participate in scheduled publishing. */
  collections: ScheduledCollectionConfig[]
  /** Cron schedule. Default: `*\/5 * * * *` (every 5 minutes). */
  schedule?: string
  /**
   * Base URL of the deployment's publishing server. Scheduled publishes
   * call through the publishing MCP so the full pipeline runs (composition
   * checks, accessibility, approval gating). Direct Payload writes would
   * skip those checks.
   */
  publishingServerUrl: string
  /**
   * API-key value for `Authorization: Bearer <key>` against the publishing
   * MCP. Falls back to `process.env.PUBLISHING_SYSTEM_API_KEY` when omitted.
   * Required at construction time — the factory throws if neither is set.
   */
  publishingApiKey?: string
  /** Override the function id. Default: `execute-scheduled-publishes`. */
  id?: string
}

export interface ExpireStaleApprovalsOptions extends BaseWorkflowOptions {
  /** Approvals collection slug. Default: 'approvals'. */
  collectionSlug?: string
  /** Cron schedule. Default: `0 2 * * *` (daily at 2am UTC). */
  schedule?: string
  /** Override the function id. Default: `expire-stale-approvals`. */
  id?: string
}

export interface AuditEchoEvent {
  action: string
  data: Record<string, unknown>
}

export interface AuditEchoHandler {
  /** Predicate. Return true to run `handle`. */
  match: (event: { action: string }) => boolean
  /** Side-effects (e.g. fire a follow-on Inngest event). */
  handle: (event: AuditEchoEvent) => Promise<void>
}

export interface AuditEventEchoOptions {
  inngest: Inngest
  /**
   * Additional handlers run after the built-in approval fan-out. Each
   * handler is wrapped in its own `step.run` so failures retry independently.
   */
  handlers?: AuditEchoHandler[]
  /** Override the function id. Default: `audit-event-echo`. */
  id?: string
}

export interface HealthcheckResult {
  ok: boolean
  details?: string
}

export interface HealthcheckDefinition {
  name: string
  run: (ctx: { payload: Payload }) => Promise<HealthcheckResult>
}

export interface HealthcheckOptions extends BaseWorkflowOptions {
  checks: HealthcheckDefinition[]
  /** Cron schedule. Default: `*\/15 * * * *`. */
  schedule?: string
  /**
   * Called once per run when at least one check fails. Defaults to
   * `console.error`; production deployments route this to monitoring.
   */
  onFailure?: (failures: Array<{ name: string; details?: string }>) => Promise<void>
  /** Override the function id. Default: `healthcheck`. */
  id?: string
}

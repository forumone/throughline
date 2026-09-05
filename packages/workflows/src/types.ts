import type { Inngest } from 'inngest'
import type { Payload } from 'payload'

/**
 * Common dependencies for workflow factories. Every factory takes an
 * Inngest client and a Payload instance — the workflows-as-factories shape
 * means the client app is responsible for instantiating both and passing
 * them in.
 */
/*
What a workflow does when a run exhausts its retries, and how many may run at
once.

Audit 06 F-09, in the consumer: across that app and all seventeen packages here,
`onFailure|idempotency|concurrency|singleton` matched no function config at all.
So a failure exhausted its retries and stopped — no dead-letter row, no email,
no page — and 12 H1 is the bill: `expire-stale-approvals` threw at 02:00 UTC
every night for eighteen days, in every environment, and nobody noticed.

These live on the base options rather than on each factory's own, so every
workflow accepts them the same way and a host wires failure handling once. The
handler is declared structurally instead of importing Inngest's own failure
type, for the reason `PayloadMcpRequest` in core gives: it keeps the shape this
package reads visible in this package, and `inngest` stays a peer named in as
few type positions as possible.
*/
export type WorkflowFailureHandler = (args: {
  /** The error that exhausted the retries. */
  error: Error
  /** Inngest's `function.failed` payload, which names the run. */
  event: {
    data?: {
      function_id?: string
      run_id?: string
      event?: { name?: string }
    }
  }
}) => Promise<void> | void

export interface BaseWorkflowOptions {
  inngest: Inngest
  payload: Payload
  /**
   * Called once when a run has exhausted its retries.
   *
   * Named `onTerminalFailure` rather than `onFailure`, and the collision that
   * forced it is worth keeping in view: `HealthcheckOptions.onFailure` already
   * exists and is a different thing — it fires once per run with the list of
   * checks that failed, on the *first* bad run, because a probe has no retries
   * to exhaust. Both are useful and a function can take both. One name for two
   * moments would have made every call site ambiguous about which it wired.
   *
   * Optional, and absent means the previous behaviour: the failure reaches
   * whatever Inngest's dashboard shows and nothing else. A host that passes one
   * gets the only signal that does not require somebody to go and look.
   */
  onTerminalFailure?: WorkflowFailureHandler
  /**
   * Maximum simultaneous runs of this function.
   *
   * Two of the crons here default to 1 because they read a set of due rows and
   * then act on them, which is a lost-update race between overlapping runs —
   * see each one's own note. Passing a value overrides that; passing one for a
   * workflow with no default adds a cap where there was none.
   */
  concurrency?: number
}

/**
 * The failure and concurrency half of a function config, built once.
 *
 * Spread into each `createFunction` config so the five workflows cannot
 * disagree about the shape — the same reason `collect-component-tokens.ts` was
 * extracted, where the writer and the checker being separate implementations
 * left 61 of 74 contracts drifted.
 *
 * `defaultConcurrency` is the factory's own answer, used when the host passes
 * none. Omitting both keys rather than passing `undefined` matters:
 * `exactOptionalPropertyTypes` is on, and Inngest reads the presence of the key.
 */
export function failureOptions(
  options: FailureAwareOptions,
  defaultConcurrency?: number,
): { onFailure?: WorkflowFailureHandler; concurrency?: number } {
  const concurrency = options.concurrency ?? defaultConcurrency

  return {
    // `onFailure` is Inngest's key; `onTerminalFailure` is ours. The rename
    // happens here, once, which is the other reason this is a function.
    ...(options.onTerminalFailure ? { onFailure: options.onTerminalFailure } : {}),
    ...(concurrency !== undefined ? { concurrency } : {}),
  }
}

/**
 * The two fields `failureOptions` reads, and nothing else.
 *
 * Narrower than `BaseWorkflowOptions` on purpose: `AuditEventEchoOptions` takes
 * an `inngest` and no `payload`, so it is not a `BaseWorkflowOptions` and asking
 * for one would have excluded it from failure handling for a reason that has
 * nothing to do with failure handling.
 */
export interface FailureAwareOptions {
  onTerminalFailure?: WorkflowFailureHandler
  concurrency?: number
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

/** One document the cron found due, handed to `publish`. */
export interface ScheduledPublishRequest {
  collection: string
  id: string
  /** Recorded on the audit event, so a scheduled publish is distinguishable. */
  reasoning: string
}

/**
 * What `publish` reports back. `published: false` is a policy refusal — a
 * composition error, a missing approval — and is expected traffic, not a fault.
 */
export interface ScheduledPublishResult {
  published: boolean
  reason?: string | undefined
}

export interface ExecuteScheduledPublishesOptions extends BaseWorkflowOptions {
  /** Collections that participate in scheduled publishing. */
  collections: ScheduledCollectionConfig[]
  /** Cron schedule. Default: `*\/5 * * * *` (every 5 minutes). */
  schedule?: string
  /**
   * How to publish one document. **Wire this to the publishing service**, not to
   * `payload.update` — the service is the seven-stage pipeline, and a direct
   * write skips composition, accessibility and approval gating:
   *
   * ```ts
   * import { getPublishingService } from '@forumone/throughline-publishing'
   *
   * publish: async ({ collection, id, reasoning }) => {
   *   const outcome = await getPublishingService(payload).publish({
   *     collection,
   *     id,
   *     actor: { apiKeyName: 'scheduled-publish', channel: 'mcp' },
   *     meta: { reasoning },
   *   })
   *   return { published: outcome.published, reason: outcome.reason }
   * }
   * ```
   *
   * Injected rather than built in because this package is a leaf — it depends on
   * `core` alone, and reaching the publishing service means depending on the
   * publishing package or duplicating its symbol string.
   *
   * It used to be a `fetch` to `POST /api/publishing/mcp` with a bearer key, and
   * that endpoint no longer exists. The self-call was also the wrong shape: it
   * cost a function invocation per document, needed a key and a base URL to be
   * right, and returned 401 rather than publishing anything if the deployment
   * URL sat behind access protection.
   */
  publish: (request: ScheduledPublishRequest) => Promise<ScheduledPublishResult>
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

export interface AuditEventEchoOptions extends FailureAwareOptions {
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

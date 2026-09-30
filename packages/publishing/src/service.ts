import type { Payload, TypedUser } from 'payload'
import type { AuditActor, AuditWriter } from '@forumone/throughline-core'
import type { AuthenticatedUser, Logger } from '@forumone/throughline-plugin-contract'
import { sendEventSafely } from './events.js'
import { type PublishingPluginOptions, resolveCollection } from './options.js'
import { runPreflightPipeline, runPublishPipeline } from './pipeline/index.js'
import type { PipelineIssue, PipelineMeta } from './pipeline/types.js'

const SERVICE_SYMBOL = Symbol.for('@forumone/throughline/publishing-service')

/**
 * Who an action is attributed to, and whose permissions it runs under.
 *
 * `user` is what lands in the audit log. `enforceAccessAs` is separate
 * because the MCP path authenticates an API key linked to a user (the key's
 * own permissions govern) while the admin path runs as a real session (the
 * editor's permissions govern).
 */
export interface PublishingActor {
  /** The principal recorded as the audit actor. */
  user?: AuthenticatedUser | null | undefined
  /** Name of the API key, when the call arrived over MCP. */
  apiKeyName?: string | undefined
  /**
   * When set, Payload reads and writes run as this user with
   * `overrideAccess: false` so collection access control applies.
   */
  enforceAccessAs?: TypedUser | undefined
  /** Recorded on the audit event's `mcpTool` so channels are distinguishable. */
  channel?: 'mcp' | 'admin' | undefined
}

export interface PublishRequest {
  collection: string
  id: string
  actor: PublishingActor
  meta?: PipelineMeta | undefined
}

export interface PublishOutcome {
  published: boolean
  publishedAt?: string
  failedAt?: string
  reason?: string
  code?: string
  issues?: PipelineIssue[]
  suggestion?: string
  /**
   * Non-fatal problems. The publish happened; something downstream of it
   * did not. Present on a successful result.
   */
  warnings?: string[]
}

export interface UnpublishOutcome {
  unpublished: boolean
  reason?: string
  warnings?: string[]
}

export interface ScheduleRequest extends PublishRequest {
  /** ISO 8601. Must be in the future. */
  publishAt: string
}

export interface ScheduleOutcome {
  scheduled: boolean
  /** The stored time, normalised to UTC ISO 8601. */
  scheduledFor?: string
  failedAt?: string
  reason?: string
  code?: string
  issues?: PipelineIssue[]
  suggestion?: string
  /**
   * A check that could not pass *yet* but may by the scheduled time — an
   * approval not granted, an embargo that ends first. The schedule stands; the
   * check runs again when it fires.
   */
  warnings?: string[]
}

export interface UnscheduleOutcome {
  unscheduled: boolean
  reason?: string
}

export interface PublishStatusOutcome {
  /** The document's current `_status`. */
  status: string
  /** Whether every preflight check passes right now. */
  publishable: boolean
  failedAt?: string
  reason?: string
  code?: string
  issues?: PipelineIssue[]
  suggestion?: string
  /** Last successful publish, or `null` if never published. */
  publishedAt: string | null
  hasUnpublishedChanges: boolean
}

export interface PublishingService {
  publish: (request: PublishRequest) => Promise<PublishOutcome>
  unpublish: (request: PublishRequest) => Promise<UnpublishOutcome>
  schedule: (request: ScheduleRequest) => Promise<ScheduleOutcome>
  unschedule: (request: PublishRequest) => Promise<UnscheduleOutcome>
  getStatus: (request: PublishRequest) => Promise<PublishStatusOutcome>
}

export interface CreatePublishingServiceDeps {
  payload: Payload
  options: PublishingPluginOptions
  auditWriter: AuditWriter
  logger?: Logger | undefined
}

/**
 * The single implementation of publish / unpublish / status. Both the MCP
 * tools and the admin endpoints call through here, so the two channels
 * cannot drift: same pipeline, same audit shape, same trust boundary.
 */
export function createPublishingService(
  deps: CreatePublishingServiceDeps,
): PublishingService {
  const { payload, options, auditWriter, logger } = deps

  /*
  `disableErrors`, and an empty object for a document that is not there.

  Without it `findByID` throws `NotFound`, which happens before the pipeline
  runs — so the `exist` step's `not-found` branch was unreachable from every
  caller, and publishing a document that does not exist came back as a thrown
  error rather than as the structured block the pipeline exists to return. The
  step's own tests passed it an empty document and so never noticed; a real
  Payload found it in one call.

  An empty object rather than `null` because that is what `existStep` already
  checks for: `Object.keys(ctx.document).length === 0`. The branch was written
  for this and only ever needed a caller that could reach it.
  */
  async function loadDocument(
    slug: string,
    id: string,
    actor: PublishingActor,
  ): Promise<Record<string, unknown>> {
    const document = await payload.findByID({
      collection: slug,
      id,
      draft: true,
      disableErrors: true,
      ...(actor.enforceAccessAs
        ? { user: actor.enforceAccessAs, overrideAccess: false }
        : {}),
    })
    return (document ?? {}) as Record<string, unknown>
  }

  /*
  Whether the document is live — which the latest version cannot say.

  `loadDocument` reads with `draft: true`, so a live page with a draft saved on
  top comes back with `_status: 'draft'`, and unpublish refused it as "not
  currently published" while it sat on the site. Scheduling a revision of a live
  page creates exactly that state, so the gap stopped being rare. A latest
  version of `published` settles it; only a `draft` needs the main row read,
  which is the same reasoning as `resolveLiveStatus` in the trust boundary.
  */
  async function liveStatus(
    slug: string,
    id: string,
    latest: Record<string, unknown>,
    actor: PublishingActor,
  ): Promise<unknown> {
    if (latest['_status'] === 'published') return 'published'
    const live = await payload.findByID({
      collection: slug,
      id,
      draft: false,
      depth: 0,
      disableErrors: true,
      ...(actor.enforceAccessAs ? { user: actor.enforceAccessAs, overrideAccess: false } : {}),
    })
    return (live as Record<string, unknown> | null)?.['_status']
  }

  return {
    async publish(request) {
      const collection = resolveCollection(options, request.collection)
      const document = await loadDocument(collection.slug, request.id, request.actor)

      const result = await runPublishPipeline({
        payload,
        inngest: options.inngest,
        options,
        collection,
        document,
        documentId: request.id,
        actor: toPipelineActor(request.actor),
        ...(request.meta ? { meta: request.meta } : {}),
      })

      await auditWriter({
        actor: toAuditActor(request.actor),
        action: 'publishing.publish',
        mcpServer: 'publishing',
        mcpTool: toolName('publish', request.actor),
        targetCollection: request.collection,
        targetId: request.id,
        targetTitle: stringField(document, 'title') ?? request.id,
        prompt: request.meta?.userPrompt,
        reasoning: request.meta?.reasoning,
        changesSummary: request.meta?.changesSummary,
        success: result.success,
        errorMessage: result.success ? undefined : result.reason,
      })

      if (result.warnings?.length) {
        logger?.warn('Publish completed with warnings', {
          collection: request.collection,
          id: request.id,
          warnings: result.warnings,
        })
      }

      const warnings = result.warnings?.length ? { warnings: result.warnings } : {}

      if (result.success) {
        return {
          published: true,
          ...(result.publishedAt ? { publishedAt: result.publishedAt } : {}),
          ...warnings,
        }
      }

      return {
        published: false,
        ...(result.failedAt ? { failedAt: result.failedAt } : {}),
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.code ? { code: result.code } : {}),
        ...(result.issues ? { issues: result.issues } : {}),
        ...(result.suggestion ? { suggestion: result.suggestion } : {}),
        ...warnings,
      }
    },

    async unpublish(request) {
      const collection = resolveCollection(options, request.collection)
      const document = await loadDocument(collection.slug, request.id, request.actor)

      // A document that is not there and one that is there and already a draft
      // are different answers, and only one of them means "nothing to do".
      if (Object.keys(document).length === 0) {
        return { unpublished: false, reason: 'Document not found' }
      }

      if ((await liveStatus(collection.slug, request.id, document, request.actor)) !== 'published') {
        return { unpublished: false, reason: 'Document is not currently published' }
      }

      // `overrideLock: false` for the same reason as the publish write: taking a
      // live page down while somebody has it open in the admin should be a
      // refusal, not a surprise. A lock held by the caller themselves passes.
      // The schedule goes with it. Left in place, a past date on a document
      // that is a draft again is exactly what the scheduled-publish backstop
      // looks for, and the page would put itself back up within the day.
      await payload.update({
        collection: collection.slug,
        id: request.id,
        data: {
          _status: 'draft',
          ...(document[collection.scheduledPublishField] != null
            ? { [collection.scheduledPublishField]: null }
            : {}),
        },
        ...(request.actor.enforceAccessAs
          ? { user: request.actor.enforceAccessAs, overrideAccess: false }
          : {}),
        overrideLock: false,
        context: { bypassPublishingServer: true },
      })

      // Same rule as publish: the write has landed, so a failed emission is
      // a warning, not a failure.
      const slug = document[collection.slugField]
      const warning = await sendEventSafely(options.inngest, {
        name: 'content/page.unpublished',
        data: {
          collection: collection.slug,
          id: request.id,
          slug: typeof slug === 'string' ? slug : request.id,
          unpublishedBy: request.actor.user?.id ?? 'system',
        },
      })

      if (warning) {
        logger?.warn('Unpublish completed with warnings', {
          collection: request.collection,
          id: request.id,
          warnings: [warning],
        })
      }

      await auditWriter({
        actor: toAuditActor(request.actor),
        action: 'publishing.unpublish',
        mcpServer: 'publishing',
        mcpTool: toolName('unpublish', request.actor),
        targetCollection: request.collection,
        targetId: request.id,
        targetTitle: stringField(document, 'title') ?? request.id,
        prompt: request.meta?.userPrompt,
        reasoning: request.meta?.reasoning,
        changesSummary: request.meta?.changesSummary,
        success: true,
      })

      return { unpublished: true, ...(warning ? { warnings: [warning] } : {}) }
    },

    async schedule(request) {
      const collection = resolveCollection(options, request.collection)
      const publishAtMs = Date.parse(request.publishAt)
      if (Number.isNaN(publishAtMs)) {
        return { scheduled: false, reason: 'The scheduled time is not a date' }
      }
      if (publishAtMs <= Date.now()) {
        return { scheduled: false, reason: 'The scheduled time must be in the future' }
      }
      const publishAt = new Date(publishAtMs).toISOString()

      const document = await loadDocument(collection.slug, request.id, request.actor)
      if (Object.keys(document).length === 0) {
        return { scheduled: false, reason: 'Document not found' }
      }

      // Everything a publish would check, now, so an editor hears about a
      // missing alt text while they are looking at the page rather than from a
      // log line on the morning it was meant to go out. The same checks run
      // again at the scheduled time; this is the early warning, not the gate.
      const preflight = await runPreflightPipeline({
        payload,
        inngest: options.inngest,
        options,
        collection,
        document,
        documentId: request.id,
        actor: toPipelineActor(request.actor),
        ...(request.meta ? { meta: request.meta } : {}),
      })

      const deferred = preflight.success
        ? { ok: true as const }
        : deferUntilScheduledTime(
            preflight as PreflightFailure,
            document,
            collection.policyField,
            publishAtMs,
          )

      const audit = (success: boolean, errorMessage?: string) =>
        auditWriter({
          actor: toAuditActor(request.actor),
          action: 'publishing.schedule',
          mcpServer: 'publishing',
          mcpTool: toolName('schedule_publish', request.actor),
          targetCollection: request.collection,
          targetId: request.id,
          targetTitle: stringField(document, 'title') ?? request.id,
          prompt: request.meta?.userPrompt,
          reasoning: request.meta?.reasoning,
          changesSummary: `Scheduled publish for ${publishAt}`,
          success,
          errorMessage,
        })

      if (!deferred.ok) {
        const block = deferred.block
        await audit(false, block.reason)
        return {
          scheduled: false,
          ...(block.failedAt ? { failedAt: block.failedAt } : {}),
          ...(block.reason ? { reason: block.reason } : {}),
          ...(block.code ? { code: block.code } : {}),
          ...(block.issues ? { issues: block.issues } : {}),
          ...(block.suggestion ? { suggestion: block.suggestion } : {}),
        }
      }

      /*
      A draft write, so it lands on the latest version and leaves the live
      document alone. That is what makes a revision of a live page schedulable
      at all — a non-draft write of one field would be a publish of the pending
      draft, which the trust boundary rightly refuses — and it is where the
      publish at the scheduled time reads from, since publishing promotes the
      latest version.

      The plugin's `afterChange` hook sees the field change and sends
      `content/page.scheduled`, so the wake-up is sent however the field was
      set: here, from the admin, over the REST API.
      */
      await payload.update({
        collection: collection.slug,
        id: request.id,
        draft: true,
        data: { [collection.scheduledPublishField]: publishAt },
        overrideLock: false,
        ...(request.actor.enforceAccessAs
          ? { user: request.actor.enforceAccessAs, overrideAccess: false }
          : {}),
      })

      await audit(true)

      return {
        scheduled: true,
        scheduledFor: publishAt,
        ...(deferred.warning ? { warnings: [deferred.warning] } : {}),
      }
    },

    async unschedule(request) {
      const collection = resolveCollection(options, request.collection)
      const document = await loadDocument(collection.slug, request.id, request.actor)
      if (Object.keys(document).length === 0) {
        return { unscheduled: false, reason: 'Document not found' }
      }
      const previous = document[collection.scheduledPublishField]
      if (previous == null) {
        return { unscheduled: false, reason: 'Nothing is scheduled' }
      }

      // No event. The run sleeping on this schedule re-reads the document when
      // it wakes, finds the field empty, and ends without publishing.
      await payload.update({
        collection: collection.slug,
        id: request.id,
        draft: true,
        data: { [collection.scheduledPublishField]: null },
        overrideLock: false,
        ...(request.actor.enforceAccessAs
          ? { user: request.actor.enforceAccessAs, overrideAccess: false }
          : {}),
      })

      // `publishing.schedule` with a summary that says which way, rather than a
      // new action: the action list is a select on the audit collection, and a
      // new value is a migration for every host.
      await auditWriter({
        actor: toAuditActor(request.actor),
        action: 'publishing.schedule',
        mcpServer: 'publishing',
        mcpTool: toolName('unschedule_publish', request.actor),
        targetCollection: request.collection,
        targetId: request.id,
        targetTitle: stringField(document, 'title') ?? request.id,
        changesSummary: `Cancelled the scheduled publish for ${String(previous)}`,
        success: true,
      })

      return { unscheduled: true }
    },

    async getStatus(request) {
      const collection = resolveCollection(options, request.collection)
      const document = await loadDocument(collection.slug, request.id, request.actor)

      const result = await runPreflightPipeline({
        payload,
        inngest: options.inngest,
        options,
        collection,
        document,
        documentId: request.id,
        actor: toPipelineActor(request.actor),
      })

      const updatedAt = stringField(document, 'updatedAt')
      const publishedAt = stringField(document, collection.publishedAtField)

      return {
        status: stringField(document, '_status') ?? 'draft',
        publishable: result.success,
        ...(result.failedAt ? { failedAt: result.failedAt } : {}),
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.code ? { code: result.code } : {}),
        ...(result.issues ? { issues: result.issues } : {}),
        ...(result.suggestion ? { suggestion: result.suggestion } : {}),
        publishedAt: publishedAt ?? null,
        hasUnpublishedChanges: Boolean(
          updatedAt && publishedAt && Date.parse(updatedAt) > Date.parse(publishedAt),
        ),
      }
    },
  }
}

type PreflightFailure = {
  success: false
  failedAt?: string | undefined
  reason?: string | undefined
  code?: string | undefined
  issues?: PipelineIssue[] | undefined
  suggestion?: string | undefined
}

/**
 * Whether a preflight block is one the scheduled time itself may resolve.
 *
 * Two are. An approval not granted *yet* is the ordinary case — schedule the
 * post, get it approved, it goes out on the day — and refusing to schedule it
 * would make an editor wait for the approver before they could pick a date. An
 * embargo that ends before the scheduled time is the other, and one that ends
 * after it is a refusal, because the publish would be refused then too.
 *
 * Both are the last two preflight steps, so every content check before them
 * has already passed. The one thing lost is that an embargo block stops the
 * pipeline before approval, so approval is not evaluated at all in that case;
 * it will be at the scheduled time.
 */
function deferUntilScheduledTime(
  preflight: PreflightFailure,
  document: Record<string, unknown>,
  policyField: string,
  publishAtMs: number,
): { ok: true; warning?: string } | { ok: false; block: PreflightFailure } {
  if (preflight.code === 'approval-required') {
    return {
      ok: true,
      warning:
        'This document needs an approval that has not been granted yet. If it is not granted by the scheduled time, the publish will be refused.',
    }
  }

  if (preflight.code === 'embargoed') {
    const policy = document[policyField] as Record<string, unknown> | undefined
    const until = typeof policy?.['embargoedUntil'] === 'string' ? Date.parse(policy['embargoedUntil']) : NaN
    if (!Number.isNaN(until) && until <= publishAtMs) {
      return {
        ok: true,
        warning:
          'The embargo ends before the scheduled time. Approval, if this document needs it, is checked when the schedule fires.',
      }
    }
    return {
      ok: false,
      block: {
        ...preflight,
        reason: `${preflight.reason ?? 'Embargoed'}, which is after the scheduled time`,
        suggestion: 'Schedule it for after the embargo ends, or change the embargo.',
      },
    }
  }

  return { ok: false, block: preflight }
}

function toPipelineActor(actor: PublishingActor) {
  return {
    user: actor.user ?? null,
    apiKeyName: actor.apiKeyName ?? '',
    ...(actor.enforceAccessAs ? { enforceAccessAs: actor.enforceAccessAs } : {}),
  }
}

/**
 * Attribution: a call carrying a real user is a user action, whoever
 * transported it. An admin publish records the editor, not a service key.
 */
function toAuditActor(actor: PublishingActor): AuditActor {
  return {
    type: actor.user ? 'user' : 'system',
    userId: actor.user?.id,
    userName: actor.user?.name,
    apiKeyName: actor.apiKeyName,
  }
}

function toolName(tool: string, actor: PublishingActor): string {
  return actor.channel === 'admin' ? `admin:${tool}` : tool
}

function stringField(doc: Record<string, unknown>, name: string): string | undefined {
  const value = doc[name]
  return typeof value === 'string' ? value : undefined
}

/** Attaches the service to the Payload instance so host code can find it. */
export function attachPublishingService(
  payload: object,
  service: PublishingService,
): void {
  Object.defineProperty(payload, SERVICE_SYMBOL, {
    value: service,
    enumerable: false,
    writable: false,
    configurable: true,
  })
}

/**
 * Returns the publishing service attached to this Payload instance.
 *
 * Use this (or the `publishDocument` / `unpublishDocument` /
 * `getPublishStatus` helpers below) from host code — a custom endpoint, a
 * job, a Server Action — to publish through the full policy pipeline as a
 * given user. No API key, and the audit event records that user.
 */
export function getPublishingService(payload: object): PublishingService {
  const service = (payload as Record<symbol, unknown>)[SERVICE_SYMBOL]
  if (!service) {
    throw new Error(
      'Publishing service not found on this Payload instance. Add publishingPlugin() to your Payload config — the service is attached during onInit.',
    )
  }
  return service as PublishingService
}

export interface DocumentActionArgs {
  payload: Payload
  collection: string
  id: string
  /** The person the action is attributed to and whose permissions apply. */
  user: TypedUser
  meta?: PipelineMeta | undefined
}

/**
 * Publishes a document through the full pipeline as `user`. Rejects if that
 * user lacks update access on the collection.
 */
export function publishDocument(args: DocumentActionArgs): Promise<PublishOutcome> {
  return getPublishingService(args.payload).publish(toRequest(args))
}

/** Reverts a published document to draft as `user`. */
export function unpublishDocument(args: DocumentActionArgs): Promise<UnpublishOutcome> {
  return getPublishingService(args.payload).unpublish(toRequest(args))
}

/** Schedules a document to publish at `publishAt`, as `user`. */
export function scheduleDocument(
  args: DocumentActionArgs & { publishAt: string },
): Promise<ScheduleOutcome> {
  return getPublishingService(args.payload).schedule({ ...toRequest(args), publishAt: args.publishAt })
}

/** Cancels a document's scheduled publish, as `user`. */
export function unscheduleDocument(args: DocumentActionArgs): Promise<UnscheduleOutcome> {
  return getPublishingService(args.payload).unschedule(toRequest(args))
}

/**
 * Runs every check except the write and reports whether the document would
 * publish. Mutates nothing.
 */
export function getPublishStatus(
  args: DocumentActionArgs,
): Promise<PublishStatusOutcome> {
  return getPublishingService(args.payload).getStatus(toRequest(args))
}

function toRequest(args: DocumentActionArgs): PublishRequest {
  return {
    collection: args.collection,
    id: args.id,
    actor: {
      user: toAuthenticatedUser(args.user),
      enforceAccessAs: args.user,
      channel: 'admin',
    },
    ...(args.meta ? { meta: args.meta } : {}),
  }
}

/** Narrows a Payload user document to the audit-log actor shape. */
export function toAuthenticatedUser(user: TypedUser | null): AuthenticatedUser | null {
  if (!user) return null
  const raw = user as unknown as Record<string, unknown>
  return {
    id: String(raw['id']),
    email: String(raw['email'] ?? ''),
    name: String(raw['name'] ?? raw['email'] ?? raw['id']),
    roles: Array.isArray(raw['roles']) ? (raw['roles'] as string[]) : [],
    groups: Array.isArray(raw['groups']) ? (raw['groups'] as string[]) : [],
  }
}

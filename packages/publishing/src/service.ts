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

      if (document['_status'] !== 'published') {
        return { unpublished: false, reason: 'Document is not currently published' }
      }

      // `overrideLock: false` for the same reason as the publish write: taking a
      // live page down while somebody has it open in the admin should be a
      // refusal, not a surprise. A lock held by the caller themselves passes.
      await payload.update({
        collection: collection.slug,
        id: request.id,
        data: { _status: 'draft' },
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

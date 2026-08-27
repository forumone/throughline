import { sendEventSafely } from '../../events.js'
import type { PipelineIssue, PipelineStep } from '../types.js'

/**
 * Performs the actual publish: writes `_status: 'published'`, stamps the
 * publishedAt field on a first publish, then fires `content/page.published`
 * with metadata subscribers can react to (revalidation, integrations, etc.).
 *
 * `publishedAt` is set only when the document does not already have one. It
 * means "when this went live", which is what a listing sorts on and what a
 * template prints on the page — so re-publishing an edit must not move it. It
 * did: every publish overwrote the field with the current time, which sent an
 * edited article to the top of its index and printed today's date on a piece
 * written months ago. An editor who typed the original date into the sidebar
 * watched it be replaced by the act of publishing.
 *
 * The guard is `wasFirstPublish`, which this step already computed for the
 * event payload and did not apply to the write.
 *
 * A document that should genuinely be re-dated is re-dated by editing the
 * field, which now survives.
 *
 * Sets `context.bypassPublishingServer = true` on the Payload update so the
 * status-write blocking hook recognizes this as a sanctioned write. Any
 * other path that tries to flip `_status` will be rejected by the hook.
 *
 * When `actor.enforceAccessAs` is set the write runs as that user with
 * `overrideAccess: false`, so Payload rejects an editor who lacks update
 * access on the collection. Bypassing the hook is not bypassing access
 * control.
 *
 * The event is emitted after the write and cannot fail the step: once
 * `_status` is `published` the publish has happened, and reporting failure
 * would send an editor back to re-publish live content.
 *
 * The write respects Payload's document locks. Without `overrideLock: false` the
 * Local API's default applies, which is to override — so an agent publishing
 * over MCP would push a document live while an editor had it open in the admin
 * and was part-way through revising it, silently. A lock only blocks when it is
 * held by *somebody else* and has been touched within its duration (five minutes
 * by default), so an editor publishing their own open document still passes, and
 * an abandoned tab stops blocking on its own.
 *
 * A field Payload refuses is a failed *step*, not a thrown error. The write is
 * the first thing in the whole pipeline that enforces `required` — a draft
 * write does not, which is the point of drafts — so an empty required field
 * inside a block reaches here and nowhere earlier. Thrown, it left the
 * transport to explain itself: the admin got a bare message and the MCP tool
 * got an exception, when Payload had already said exactly which paths were
 * wrong. Returned as issues, it travels the same road as every other block —
 * onto the fields in the admin, into the tool's result, into the audit row.
 */
export const executeStep: PipelineStep = async (ctx) => {
  const now = new Date().toISOString()
  const previousPublishedAt =
    typeof ctx.document[ctx.collection.publishedAtField] === 'string'
      ? (ctx.document[ctx.collection.publishedAtField] as string)
      : null
  const wasFirstPublish = previousPublishedAt === null

  try {
    await ctx.payload.update({
      collection: ctx.collection.slug,
      id: ctx.documentId,
      data: {
        _status: 'published',
        ...(wasFirstPublish ? { [ctx.collection.publishedAtField]: now } : {}),
      },
      ...(ctx.actor.enforceAccessAs
        ? { user: ctx.actor.enforceAccessAs, overrideAccess: false }
        : {}),
      overrideLock: false,
      context: { bypassPublishingServer: true },
    })
  } catch (error) {
    // Somebody is in the document. Not a failure to investigate — a state that
    // resolves itself, and one the caller can act on: wait, or ask them.
    if (isLocked(error)) {
      return {
        pass: false,
        code: 'document-locked',
        reason: 'Somebody is editing this document right now',
        suggestion:
          'A lock is released when the editor closes the document, and expires on its own a few minutes after they stop. Try again, or ask them to finish.',
      }
    }

    const issues = fieldIssues(error)
    // Only a field rejection is an answer. A database or access failure is
    // not, and rethrowing keeps it out of the diagnostics an editor reads as
    // "fix these fields".
    if (!issues) throw error
    return {
      pass: false,
      code: 'field-validation-failed',
      reason: `${issues.length} field${issues.length === 1 ? '' : 's'} the collection will not accept`,
      issues,
      suggestion:
        'These are required by the collection rather than by a policy check, so they must be filled before this document can be published.',
    }
  }

  // The write has landed. From here the publish has happened, so nothing
  // below may turn it back into a failure.
  const warning = await sendEventSafely(ctx.inngest, {
    name: 'content/page.published',
    data: {
      collection: ctx.collection.slug,
      id: ctx.documentId,
      slug: String(ctx.document[ctx.collection.slugField] ?? ctx.documentId),
      publishedBy: ctx.actor.user?.id ?? 'system',
      previousPublishedAt,
      isFirstPublish: wasFirstPublish,
    },
  })

  return { pass: true, ...(warning ? { warnings: [warning] } : {}) }
}

/**
 * Payload's `ValidationError` as issues, or `undefined` for anything else.
 *
 * Read structurally rather than with `instanceof`. The class would work in the
 * ordinary install and fail in the one that matters — two copies of `payload`
 * resolved under one tree make `instanceof` false for an error that is one in
 * every other respect, and the failure mode is a silent rethrow of something
 * an editor could have fixed. The shape is stable: `data.errors` is a list of
 * `{ path, message }`, and the paths are already dotted form paths.
 */
function fieldIssues(error: unknown): PipelineIssue[] | undefined {
  if (!error || typeof error !== 'object') return undefined
  const data = (error as { data?: unknown }).data
  if (!data || typeof data !== 'object') return undefined
  const errors = (data as { errors?: unknown }).errors
  if (!Array.isArray(errors) || errors.length === 0) return undefined

  const issues: PipelineIssue[] = []
  for (const entry of errors) {
    if (!entry || typeof entry !== 'object') return undefined
    const { path, message } = entry as { path?: unknown; message?: unknown }
    if (typeof path !== 'string' || typeof message !== 'string') return undefined
    issues.push({ field: path, message, severity: 'error' })
  }
  return issues
}

/**
 * Payload's `Locked`, read structurally for the same reason as `fieldIssues`
 * below it: two copies of `payload` under one tree make `instanceof` false for
 * an error that is one in every other respect. 423 is the status the class
 * carries, and the name is the belt to its braces.
 */
function isLocked(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { status, name } = error as { status?: unknown; name?: unknown }
  return status === 423 || name === 'Locked'
}

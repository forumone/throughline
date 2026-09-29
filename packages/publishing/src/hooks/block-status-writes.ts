import { APIError } from 'payload'
import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'
import { isDraftWrite } from './draft-writes.js'

/**
 * The trust boundary. This `beforeChange` hook rejects every update that
 * changes whether a document is live, unless the request explicitly carries
 * the `bypassPublishingServer` context flag (set by the pipeline's
 * `executeStep`).
 *
 * Without this hook, the Payload MCP could let Claude flip a document to
 * `published` directly, sidestepping every check the publishing server
 * exists to enforce. With it, the only sanctioned path is the pipeline.
 *
 * Three details of Payload's update pipeline shape this:
 *
 * 1. `data` is the existing document merged with the incoming changes, so
 *    `_status` is present on essentially every update — an ordinary field
 *    edit on a published document arrives carrying `_status: 'published'`.
 *    The presence of `_status` therefore means nothing on its own.
 *
 * 2. Payload injects `data._status = 'draft'` into every `draft: true`
 *    update before this hook runs, so a draft save of a published document
 *    arrives looking like an unpublish. `createRecordDraftWritesHook`
 *    captures the operation's real `draft` flag to tell them apart; both
 *    hooks must be installed together.
 *
 * 3. `originalDoc` is the *latest version*, not the live document. Once any
 *    draft version exists on a published document, `originalDoc._status` is
 *    `'draft'` while the document is still live — so comparing against it
 *    reads a genuine unpublish as a harmless no-op.
 *
 * So the question asked here is narrow and concrete: **would this write
 * change what the public sees?** A draft write never does. A non-draft
 * write does when it takes a live document down, or when it puts content
 * live — including promoting a pending draft, which leaves `_status` on
 * `published` throughout and so cannot be caught by comparing statuses
 * alone.
 *
 * One non-draft `published` write over a pending draft is harmless: one
 * whose content is exactly what is already live. That is Payload's own
 * "Revert to published", which reads the live document and writes it back
 * unchanged to discard the draft — the public sees nothing new, so there is
 * nothing for the pipeline to check.
 */
export function createBlockStatusWritesHook(): CollectionBeforeChangeHook {
  return async ({ collection, data, originalDoc, operation, context, req }) => {
    if (operation !== 'update') return data
    if (!carriesStatus(data)) return data
    if (isBypassed(context) || isBypassed(req?.context)) return data

    const nextStatus = (data as Record<string, unknown>)['_status']
    const previousStatus = (originalDoc as Record<string, unknown> | undefined)?.['_status']
    const id = (originalDoc as { id?: unknown } | undefined)?.id

    // A draft save writes a version and leaves the live document alone.
    //
    // Mirror Payload's own `isSavingDraft`, which excludes `published`: a
    // request asking for `draft: true` while setting `_status: 'published'`
    // is a real publish, so `draft` cannot become a way around the pipeline.
    if (nextStatus !== 'published' && isDraftWrite(req, collection?.slug, id)) {
      return data
    }

    if (nextStatus === 'published') {
      // This puts content live. Allowed only when the document is already
      // live *and* nothing is pending: a latest version of `published`
      // means there is no newer draft for this write to promote. When a
      // draft is pending, this is the publish and it belongs in the
      // pipeline — even though the live status does not change.
      if (previousStatus === 'published') return data
      if (await restatesLiveContent(req, collection?.slug, id, data)) return data
    } else {
      // This takes the live document down. Harmless only if nothing is
      // live: a document that was never published, or is already down.
      const liveStatus = await resolveLiveStatus(req, collection?.slug, id, previousStatus)
      if (liveStatus !== undefined && liveStatus !== 'published') return data
    }

    throw new APIError(
      'Direct writes to `_status` are not allowed. Use the publishing server (publish / unpublish / rollback) so the policy pipeline runs.',
      400,
    )
  }
}

/**
 * The live document's current `_status`, or `undefined` when it cannot be
 * established — in which case the caller blocks the write.
 *
 * `originalDoc` is the latest version. A latest version of `published`
 * means the live document is published, so that answer is taken directly.
 * A latest version of `draft` is ambiguous — the document may still be live
 * with a newer draft sitting on top of it — and only then is the published
 * row read. Draft writes return before reaching this, so the admin's
 * publish flow never pays for the query.
 */
async function resolveLiveStatus(
  req: PayloadRequest | undefined,
  collectionSlug: string | undefined,
  id: unknown,
  previousStatus: unknown,
): Promise<string | undefined> {
  if (previousStatus === 'published') return 'published'
  if (!req?.payload || !collectionSlug || id === undefined || id === null) return undefined

  try {
    const live = await req.payload.findByID({
      collection: collectionSlug,
      id: id as number | string,
      depth: 0,
      overrideAccess: true,
      // Share the request so this reads inside the open transaction.
      req,
    })
    const status = (live as Record<string, unknown> | null)?.['_status']
    return typeof status === 'string' ? status : undefined
  } catch {
    return undefined
  }
}

/**
 * Fields that differ between two writes of the same content: the row's
 * identity, its timestamps, and the status this hook is already judging.
 */
const NOT_CONTENT = new Set(['id', 'createdAt', 'updatedAt', '_status'])

/**
 * Whether `data` is the live document's content, unchanged — so writing it
 * would leave the public site exactly as it is.
 *
 * Compared as JSON so a `Date` and its ISO string agree, ignoring key order,
 * and with a missing key equal to `null`, which is how Payload stores an
 * empty field. Anything
 * it cannot read counts as a change, and the caller blocks.
 */
async function restatesLiveContent(
  req: PayloadRequest | undefined,
  collectionSlug: string | undefined,
  id: unknown,
  data: unknown,
): Promise<boolean> {
  if (!req?.payload || !collectionSlug || id === undefined || id === null) return false

  let live: unknown
  try {
    live = await req.payload.findByID({
      collection: collectionSlug,
      id: id as number | string,
      depth: 0,
      draft: false,
      overrideAccess: true,
      req,
    })
  } catch {
    return false
  }
  if (!live || typeof live !== 'object') return false
  if ((live as Record<string, unknown>)['_status'] !== 'published') return false

  const next = asJSON(data)
  const current = asJSON(live)
  const keys = new Set([...Object.keys(next), ...Object.keys(current)])
  for (const key of keys) {
    if (NOT_CONTENT.has(key)) continue
    if (!sameContent(next[key], current[key])) return false
  }
  return true
}

function asJSON(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

/** Deep equality over JSON values, ignoring object key order. */
function sameContent(a: unknown, b: unknown): boolean {
  a = a ?? null
  b = b ?? null
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const other = b as unknown[]
    return a.length === other.length && a.every((item, i) => sameContent(item, other[i]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) if (!sameContent(left[key], right[key])) return false
  return true
}

/**
 * Whether `_status` is present at all. Payload merges the stored document
 * into `data`, so this is true for nearly every update — it only filters
 * out collections without drafts.
 */
function carriesStatus(data: unknown): boolean {
  return typeof data === 'object' && data !== null && '_status' in data
}

function isBypassed(context: unknown): boolean {
  if (!context || typeof context !== 'object') return false
  return (context as Record<string, unknown>)['bypassPublishingServer'] === true
}

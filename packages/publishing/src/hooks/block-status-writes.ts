import { APIError } from 'payload'
import type { CollectionBeforeChangeHook } from 'payload'
import { isDraftWrite } from './draft-writes.js'

/**
 * The trust boundary. This `beforeChange` hook rejects every update that
 * changes the live document's `_status` unless the request explicitly
 * carries the `bypassPublishingServer` context flag (set by the pipeline's
 * `executeStep`).
 *
 * Without this hook, the Payload MCP could let Claude flip a document to
 * `published` directly, sidestepping every check the publishing server
 * exists to enforce. With it, the only sanctioned path is the pipeline.
 *
 * Draft writes pass through. A `draft: true` update writes a new row in the
 * versions table and leaves the published document alone, so it changes no
 * live status — but Payload injects `data._status = 'draft'` into every such
 * update before this hook runs, which made saving a draft of a published
 * document indistinguishable from unpublishing it. `createRecordDraftWritesHook`
 * captures the operation's real `draft` flag so the two can be told apart;
 * both hooks must be installed together.
 *
 * Throws `APIError` rather than `Error` so Payload returns 400 with the
 * message intact instead of swallowing it into a 500 and a generic
 * "Something went wrong" toast.
 */
export function createBlockStatusWritesHook(): CollectionBeforeChangeHook {
  return ({ collection, data, originalDoc, operation, context, req }) => {
    if (operation !== 'update') return data
    if (!hasStatusChange(data)) return data

    // No-op writes (status set to its current value) are harmless.
    if (
      originalDoc &&
      typeof originalDoc === 'object' &&
      (data as Record<string, unknown>)['_status'] ===
        (originalDoc as Record<string, unknown>)['_status']
    ) {
      return data
    }

    if (isBypassed(context) || isBypassed(req?.context)) return data

    // A draft save touches a version, not the live document.
    //
    // Mirror Payload's own `isSavingDraft`, which requires the incoming
    // status to be something other than `published`. A request that asks for
    // `draft: true` while setting `_status: 'published'` is a real publish —
    // Payload treats it as one — so it stays blocked. Without this, `draft`
    // would be a way to publish around the pipeline.
    if (
      (data as Record<string, unknown>)['_status'] !== 'published' &&
      isDraftWrite(req, collection?.slug, (originalDoc as { id?: unknown } | undefined)?.id)
    ) {
      return data
    }

    throw new APIError(
      'Direct writes to `_status` are not allowed. Use the publishing server (publish / unpublish / rollback) so the policy pipeline runs.',
      400,
    )
  }
}

function hasStatusChange(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null && '_status' in data
  )
}

function isBypassed(context: unknown): boolean {
  if (!context || typeof context !== 'object') return false
  return (context as Record<string, unknown>)['bypassPublishingServer'] === true
}

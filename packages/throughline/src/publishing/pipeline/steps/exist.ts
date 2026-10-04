import type { PipelineStep } from '../types.js'

/** Also what unpublish, schedule and unschedule say for a document that is not there. */
export const NOT_FOUND =
  "This document couldn't be found. It may have been deleted or moved to the trash."

/**
 * Verifies the document exists and isn't already published with no
 * outstanding draft changes. The publish operation should be idempotent
 * but not silent — re-publishing a clean document returns a clear "already
 * published" response so callers can distinguish that from success.
 */
export const existStep: PipelineStep = async (ctx) => {
  if (!ctx.document || Object.keys(ctx.document).length === 0) {
    return { pass: false, code: 'not-found', reason: NOT_FOUND }
  }

  const isPublished = ctx.document['_status'] === 'published'
  if (isPublished && !hasUnpublishedChanges(ctx.document, ctx.collection.publishedAtField)) {
    return {
      pass: false,
      code: 'already-published',
      reason: "There's nothing new to publish.",
      suggestion: 'Make a change first, then publish.',
    }
  }

  return { pass: true }
}

function hasUnpublishedChanges(
  doc: Record<string, unknown>,
  publishedAtField: string,
): boolean {
  const updatedRaw = doc['updatedAt']
  const publishedRaw = doc[publishedAtField]
  const updatedAt = typeof updatedRaw === 'string' ? Date.parse(updatedRaw) : 0
  const publishedAt = typeof publishedRaw === 'string' ? Date.parse(publishedRaw) : 0
  if (Number.isNaN(updatedAt) || Number.isNaN(publishedAt)) return true
  return updatedAt > publishedAt
}

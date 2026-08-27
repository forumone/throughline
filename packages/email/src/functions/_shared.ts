export { unwrapRelationshipId } from '@forumone/throughline-core'

import type { ApprovalTargetKind } from '../templates/index.js'

const COLLECTION_TO_KIND: Record<string, ApprovalTargetKind> = {
  pages: 'page',
  posts: 'post',
}

/**
 * Maps a collection slug to the human-friendly noun the templates render.
 * Defaults to "item" so unknown collections still produce sensible copy
 * ("the item Homepage" reads weirder than "the page Homepage" but it's
 * better than dropping the noun entirely).
 */
export function targetKindFromCollection(slug: string): ApprovalTargetKind {
  return COLLECTION_TO_KIND[slug] ?? 'item'
}

/**
 * Defensive normalizer for the `notifiedApprovers` json field. Older
 * snapshots stored an array of strings; the post-C7 fixup wraps each
 * as `{ id, at, channel }`. We accept either shape.
 */
export function readApproverIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      ids.push(entry)
    } else if (entry && typeof entry === 'object' && 'id' in entry) {
      ids.push(String((entry as { id: unknown }).id))
    }
  }
  return ids
}

export function formatHumanDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

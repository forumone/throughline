import { sha256Hex } from '../auth/api-keys.js'

/**
 * Fields that move without the content moving. Stripped at every level of
 * the document before hashing.
 *
 * `updatedAt` is the reason this module exists: an approval bound to it is
 * invalidated by any save at all, including one that changed nothing, and
 * including every tick of autosave. `createdAt`, `_status`, `__v`,
 * `globalType` and `_id` are storage and publishing machinery rather than
 * anything an approver read.
 *
 * The document's own `id` is stripped separately, at the top level only —
 * see `normalize`.
 */
const VOLATILE_FIELDS = new Set(['createdAt', 'updatedAt', '_status', '__v', '_id', 'globalType'])

export interface DocumentContentHashOptions {
  /**
   * Extra field names to treat as volatile, stripped at every level.
   * For app-specific bookkeeping written on save — a sync timestamp, a
   * cached count — that no approver is looking at.
   */
  exclude?: string[]
}

/**
 * Hashes the *content* of a document, ignoring the metadata that moves on
 * every save.
 *
 * This is the binding an approval is tied to. Two documents hash the same
 * when an approver would read the same thing, which means:
 *
 * - a save that changed nothing leaves a granted approval standing, and
 * - a save that changed something invalidates it.
 *
 * That is the rule stated deliberately, rather than inherited from
 * whichever timestamp field happened to be nearby.
 *
 * **Both sides must hash a document fetched the same way.** The approvals
 * request tool and publishing's approval step both use
 * `payload.findByID({ collection, id, draft: true })` at the config's
 * default depth, so they see the same shape. A caller that hashes a
 * document fetched at some other depth gets a hash that matches nothing:
 * a populated relationship and a bare relationship id are not the same
 * value, and no amount of normalising makes them one.
 */
export async function documentContentHash(
  document: Record<string, unknown>,
  options: DocumentContentHashOptions = {},
): Promise<string> {
  const volatile = new Set(VOLATILE_FIELDS)
  for (const field of options.exclude ?? []) volatile.add(field)
  return sha256Hex(stableStringify(normalize(document, volatile, true)))
}

/**
 * Strips volatile fields and normalises values whose representation can
 * vary without their meaning varying.
 *
 * `id` is dropped only at the top level, where it is the document's own id
 * and constant for the life of the document. Nested `id`s are kept, because
 * that is where a populated relationship carries which document it points
 * at — dropping those would make a page that swapped one image for another
 * with the same alt text hash identically to the one an approver read.
 */
function normalize(value: unknown, volatile: Set<string>, topLevel = false): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((entry) => normalize(entry, volatile))
  if (value === null || typeof value !== 'object') return value

  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (volatile.has(key)) continue
    if (topLevel && key === 'id') continue
    // A field the caller never set and one set to `undefined` are the same
    // document. JSON.stringify already drops these; doing it here keeps the
    // sorted key list honest.
    if (entry === undefined) continue
    result[key] = normalize(entry, volatile)
  }
  return result
}

/**
 * `JSON.stringify` with object keys in sorted order, so that two documents
 * differing only in key order hash the same. Payload reads blocks back out
 * of JSONB, and neither Postgres nor the JSON parser promises to hand them
 * back in the order they went in.
 *
 * Array order is meaningful — it is the order of the blocks on the page —
 * and is preserved.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

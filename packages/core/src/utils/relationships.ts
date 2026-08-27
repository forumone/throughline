/**
 * The id out of a Payload relationship field, whatever depth it came back at.
 *
 * A relationship is an id at depth 0 and a populated document above it, so every
 * reader has to handle both. Four copies of this existed — three private to
 * `approvals`, one exported from `email` — differing only in a null guard that
 * `typeof value === 'string'` already covers.
 *
 * **One deliberate difference from all four.** None of them handled a *numeric*
 * id, so on Postgres at `depth: 0` they returned `null` for a relationship that
 * was populated perfectly well. No current caller reads at depth 0 — they take
 * the config default and get objects — so this fixes nothing today and stops a
 * shared helper being wrong for the first caller that does. The change can only
 * turn a `null` into a correct id, and no caller branches on that distinction.
 */
export function unwrapRelationshipId(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id)
  }
  return null
}

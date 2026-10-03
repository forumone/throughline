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

/** What `relationshipIdFor` reads off a Payload instance. */
export interface IdTypeSource {
  collections: Record<string, { customIDType?: 'number' | 'text' } | undefined>
  db: { defaultIDType: 'number' | 'text' }
}

/**
 * An id as a relationship to `relationTo` stores it: a number when that
 * collection's ids are numbers, the string otherwise.
 *
 * The other direction from `unwrapRelationshipId`. An MCP tool's caller arrives
 * as `ctx.user.id`, a string, because `AuthenticatedUser` is shaped for every
 * adapter. On Postgres the `users` ids are serial numbers, and Payload refuses
 * `"1"` for a relationship to them — "The following field is invalid" — so
 * `request_approval` could not store a request at all, and `respond_to_approval`
 * could not record who decided. A collection with its own id field says so in
 * `customIDType`; otherwise the adapter's default applies.
 */
export function relationshipIdFor(payload: IdTypeSource, relationTo: string, id: string): string | number {
  const type = payload.collections[relationTo]?.customIDType ?? payload.db.defaultIDType
  return type === 'number' && /^\d+$/.test(id) ? Number(id) : id
}

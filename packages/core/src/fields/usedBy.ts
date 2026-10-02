import type { CollectionSlug, Field, FieldAccess } from 'payload'

/*
"Where is this used?" for the collections other documents point at. From
forumone-2026's `fields/usedBy.ts`.

A join field is a read-only list, on the document being pointed at, of the
documents that point at it through a relationship: a person's articles, a
client's case studies. It is virtual (no column, no migration, nothing to keep
in sync) because it is a query over the relationship that already exists.

What it cannot see is a reference inside a block, which has no relationship row
to join. `findReferences` scans for those.

**Keep it admin-only in cost as well as in sight.** `access.read` is signed-in
by default, so a public read never returns the lists. And the owning
collection's `defaultPopulate` should exclude every join field, and render-path
reads pass `joins: false`; otherwise Postgres builds each join as a subquery on
every populated document.
*/

const signedIn: FieldAccess = ({ req }) => Boolean(req.user)

export function usedBy(options: {
  name: string
  label: string
  collection: CollectionSlug
  /** The relationship field on `collection` that points here. */
  on: string
  defaultColumns: string[]
  /** Who may read the list. Default: anyone signed in. */
  read?: FieldAccess
}): Field {
  return {
    name: options.name,
    type: 'join',
    label: options.label,
    collection: options.collection,
    on: options.on,
    defaultLimit: 10,
    defaultSort: '-updatedAt',
    access: { read: options.read ?? signedIn },
    admin: {
      allowCreate: false,
      defaultColumns: options.defaultColumns,
    },
  }
}

import {
  ValidationError,
  type CollectionBeforeValidateHook,
  type CollectionSlug,
  type Field,
} from 'payload'

/*
The URL segment, and the trash that still holds one. From forumone-2026's
`fields/slug.ts` and `hooks/trashedSlug.ts`.
*/

/** Lowercase, hyphenated, no leading or trailing hyphen. */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      // Strip accents, so "Sécurité" slugs as "securite" rather than losing the
      // letter entirely.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  )
}

/**
 * The URL segment, derived from another field but editable.
 *
 * Filled from `from` when empty and normalised whenever it is set, so an author
 * who types nothing gets a correct slug and an author who types `About Us!`
 * gets `about-us` rather than a 404. It is never *re*-derived once set:
 * retitling a published page must not silently move its URL.
 */
export function slugField(options: { from?: string; unique?: boolean } = {}): Field {
  const from = options.from ?? 'title'

  return {
    name: 'slug',
    type: 'text',
    required: true,
    index: true,
    ...(options.unique === false ? {} : { unique: true }),
    admin: {
      position: 'sidebar',
      description: 'The last segment of the URL. Left empty, it follows the title.',
    },
    hooks: {
      beforeValidate: [
        ({ value, data }) => {
          if (typeof value === 'string' && value.trim() !== '') return slugify(value)

          const source = (data as Record<string, unknown> | undefined)?.[from]
          return typeof source === 'string' && source.trim() !== '' ? slugify(source) : value
        },
      ],
    },
  }
}

/** The refusal when a trashed document holds a slug. */
export function heldInTrash(slug: string, title: string, kind?: string): string {
  const what = kind ? `the ${kind} "${title}"` : `"${title}"`
  return `/${slug} belongs to ${what}, which is in the trash. Restore it, or delete it permanently, to use this slug.`
}

/** A title, a name, or failing both the slug. */
export function titleOf(doc: Record<string, unknown>): string {
  for (const key of ['title', 'name']) {
    const value = doc[key]
    if (typeof value === 'string' && value) return value
  }
  return String(doc['slug'])
}

/*
A trashed document keeps its slug, and says so.

`slug` carries a unique index, and the trash is a `deletedAt` timestamp on the
same row, so a page in the trash still holds its address: that is what lets it
be restored to the URL it had. The cost is the save that collides with it. An
editor creates a new "About" page and gets Payload's bare "The following field
is invalid: slug", caused by a document the list no longer shows them.

This names the document and the way out before the database refuses. Every
other read in the admin leaves the trash out, so it asks with `trash: true`. It
runs after the field hooks, so `slugField` has already normalised the value, and
it only queries when the slug is new or has changed: autosave sends the whole
document every two seconds.
*/
export function refuseSlugHeldInTrash(collection: CollectionSlug): CollectionBeforeValidateHook {
  return async ({ data, originalDoc, req }) => {
    const candidate: unknown = data?.['slug']
    const slug = typeof candidate === 'string' ? candidate.trim() : ''
    if (!slug || slug === originalDoc?.slug) return data

    const { docs } = await req.payload.find({
      collection,
      where: { and: [{ slug: { equals: slug } }, { deletedAt: { exists: true } }] },
      trash: true,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
    })

    const holder = docs[0] as Record<string, unknown> | undefined
    if (!holder) return data

    // `t`, or Payload writes its "The following field is invalid:" prefix in
    // hard-coded English and a host's translation of it never applies.
    throw new ValidationError(
      {
        collection,
        errors: [{ path: 'slug', label: 'Slug', message: heldInTrash(slug, titleOf(holder)) }],
        req,
      },
      req.t,
    )
  }
}

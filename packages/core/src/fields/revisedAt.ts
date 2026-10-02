import type { Field } from 'payload'

/*
When an editor last revised the published document, not when the row last
changed. From forumone-2026's `fields/revisedAt.ts` (#444 there).

**These are not the same thing.** A sitemap's `lastmod` and
`article:modified_time` that read Payload's `updatedAt` tell crawlers whatever
last touched the row: forumone-2026's content migration put all 153 timestamps
inside a 17-day window, so the site claimed its whole archive was revised in
the same three days. `lastmod` is a pre-read filter, and a crawler that learns a
site's `lastmod` is noise stops using it.

`updatedAt` cannot be made correct about content after the fact, so this
records real revisions from here on. A reader of it falls back to `publishedAt`
for a document never revised, which needs no backfill.
*/

/**
 * A read-only sidebar date, set when a person's save changes a published
 * document. Not for a collection mirrored from elsewhere, where nobody edits
 * anything and every field is overwritten on every sync.
 */
export function revisedAtField(options: { description?: string } = {}): Field {
  return {
    name: 'revisedAt',
    type: 'date',
    /*
    No index. Nothing sorts or filters on it (the sitemap and the metadata each
    read it off a row they already have), and an index would be one per
    collection and per version table to serve no query.
    */
    admin: {
      position: 'sidebar',
      readOnly: true,
      date: { pickerAppearance: 'dayAndTime' },
      description:
        options.description ??
        'Set automatically when a change is published. Until then, the published date is used.',
    },
    hooks: {
      beforeChange: [
        ({ value, req, operation, data, originalDoc }) => {
          /*
          A new document has not been revised; it has been written. Leaving this
          empty is what makes the fallback to `publishedAt` fire.
          */
          if (operation === 'create') return undefined

          /*
          Only a person's save counts. Integrations, workers and scripts write
          with no user, and those are exactly the writes that produced the bad
          data this field exists to replace.
          */
          if (!req?.user) return value

          /*
          And only once it is public. `lastmod` describes the URL a crawler can
          fetch; a draft revision has not reached it. With autosave this is
          load-bearing: otherwise every draft save would advance the date.
          */
          const status = (data?.['_status'] ?? originalDoc?._status) as string | undefined
          if (status !== 'published') return value

          return new Date().toISOString()
        },
      ],
    },
  }
}

/** When a published document last changed, or `undefined` when nothing honest is known. */
export function contentRevisedAt(doc: {
  revisedAt?: string | null | undefined
  publishedAt?: string | null | undefined
}): string | undefined {
  for (const value of [doc.revisedAt, doc.publishedAt]) {
    if (typeof value !== 'string' || value.trim() === '') continue
    // A stored date that does not parse is not worth emitting.
    if (Number.isNaN(new Date(value).getTime())) continue
    return value
  }
  return undefined
}

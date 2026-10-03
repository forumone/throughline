import type { Field, Where } from 'payload'

/*
A document that is live at its URL and absent from every automatic list. From
forumone-2026's `fields/unlisted.ts`, where the case was a conference: an
article written for the people in one room, handed out as a link, that would be
noise at the top of the site's listings.

**It is not `meta.noIndex`**, and the two are deliberately independent. That is
about search engines; this is about the site's own lists. A host applies
`LISTED` to every query that *chooses* documents (archives, listing blocks in
query mode, related content, feeds) and leaves it off a list an editor filled
by hand, because picking a document by name is a decision this flag must not
overrule.
*/
export function unlistedField(options: { description?: string } = {}): Field {
  return {
    name: 'unlisted',
    type: 'checkbox',
    label: 'Hide from listings',
    defaultValue: false,
    admin: {
      position: 'sidebar',
      description:
        options.description ??
        'Live at its URL, but left out of listings, related content and feeds. Search engines still see it unless it is also hidden from them.',
    },
  }
}

/**
 * The constraint every automatic list carries.
 *
 * `not_equals` rather than `equals: false`: the Postgres adapter reads it as
 * `IS NULL OR <> true`, so a row written before the column existed counts as
 * listed rather than vanishing.
 */
export const LISTED: Where = { unlisted: { not_equals: true } }

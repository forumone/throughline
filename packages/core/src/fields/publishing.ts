import type { Field, FieldHook } from 'payload'

/*
The sidebar dates a published document carries. From forumone-2026's
`fields/publishing.ts`.
*/

/**
 * The `beforeChange` behind `publishedAtField`.
 *
 * Stamps the moment of the first publish when the field is empty, and leaves a
 * date somebody entered alone (a migrated post's original date is the reason
 * the field is editable at all). A write with no user counts: a scheduled
 * publish went live at that moment as much as one a person published.
 *
 * **An empty value is not proof of a first publish.** The edit form keeps the
 * value it loaded with, so a page first published from an open editor sends
 * `null` again on its next save, and a hook reading only the incoming value
 * would move the page's date on every publish. So with nothing incoming, the
 * date the *published* document already carries wins.
 */
export const keepOrStampPublishedAt: FieldHook = async ({
  value,
  data,
  originalDoc,
  collection,
  req,
}) => {
  const incoming: unknown = value
  if (incoming) return incoming

  const publishing = (data as { _status?: unknown } | undefined)?._status === 'published'
  if (!publishing) return incoming

  const id = (originalDoc as { id?: number | string } | undefined)?.id
  if (id !== undefined && collection) {
    const published = await req.payload
      .findByID({
        collection: collection.slug,
        id,
        depth: 0,
        draft: false,
        overrideAccess: true,
        req,
        disableErrors: true,
      })
      .catch(() => null)
    const existing = (published as { publishedAt?: unknown } | null)?.publishedAt
    if (typeof existing === 'string' && existing !== '') return existing
  }

  return new Date().toISOString()
}

/** `publishedAt`, which fills itself on the first publish. */
export function publishedAtField(description: string, options: { index?: boolean } = {}): Field {
  return {
    name: 'publishedAt',
    type: 'date',
    // Indexed where listings sort on it.
    ...(options.index === false ? {} : { index: true }),
    admin: { position: 'sidebar', description },
    hooks: { beforeChange: [keepOrStampPublishedAt] },
  }
}

/**
 * A scheduled publish. `publishingPlugin` renders it as its Schedule control:
 * picking a time runs the publish checks at once, stores the time with a draft
 * save, and wakes the job that publishes at it. A publish or an unpublish
 * clears it.
 */
export function scheduledPublishField(): Field {
  return {
    name: 'scheduledPublishAt',
    type: 'date',
    admin: {
      position: 'sidebar',
      date: { pickerAppearance: 'dayAndTime' },
      description:
        'Publishes automatically at this time, after the same checks as publishing by hand. Set with the Schedule control; cleared when the document is published or unpublished.',
    },
  }
}

/** `publishedAt` and `scheduledPublishAt`, for every content type. */
export function publishingFields(
  options: { publishedAtDescription?: string; index?: boolean } = {},
): Field[] {
  return [
    publishedAtField(
      options.publishedAtDescription ??
        'The date shown on the page and used to sort listings. Leave it empty and it is set when this is first published; for a migrated post, enter the original date.',
      options.index === false ? { index: false } : {},
    ),
    scheduledPublishField(),
  ]
}

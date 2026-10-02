import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

/*
What is waiting on somebody: every document with unpublished changes, newest
first, and every scheduled publish, soonest first. The one read behind the
dashboard's "Your work" panels and the `list_my_work` tool. From forumone-2026's
`admin/YourWork.tsx`.

"Your" is the team's, not the viewer's: nothing records who edited what (the
audit log sees MCP and pipeline actions but not saves in the admin), so this
lists everything waiting that the viewer can open. Read with
`overrideAccess: false`, so it lists nothing they could not.

A collection that fails is left out and logged rather than taking the dashboard
down with it: this is a convenience, not the way in.
*/

export interface WorkOptions {
  /** The collections to look in. */
  collections: readonly CollectionSlug[]
  /** Default `scheduledPublishAt`, the field `publishingPlugin` schedules by. */
  scheduledField?: string
  /** Rows per list. Default 8. */
  limit?: number
}

export interface WorkRow {
  collection: string
  /** The collection's singular label: "Page". */
  label: string
  id: number | string
  title: string
  /** When it was last saved, or when it will publish. */
  at: string
}

export interface YourWorkResult {
  generatedAt: string
  /** Latest save is a draft, newest first. */
  changes: WorkRow[]
  /** A schedule in the future, soonest first. */
  scheduled: WorkRow[]
}

function labelOf(payload: Payload, slug: string): string {
  const singular = payload.collections[slug as CollectionSlug]?.config.labels.singular
  return typeof singular === 'string' ? singular : slug
}

function titleOf(doc: Record<string, unknown>): string {
  for (const key of ['title', 'name']) {
    const value = doc[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return 'Untitled'
}

async function rowsFrom(
  payload: Payload,
  collections: readonly CollectionSlug[],
  query: (collection: CollectionSlug) => Promise<{ docs: unknown[] }>,
  at: (doc: Record<string, unknown>) => unknown,
): Promise<WorkRow[]> {
  const settled = await Promise.allSettled(
    collections.map(async (collection) => {
      const { docs } = await query(collection)
      return (docs as Record<string, unknown>[]).map((doc) => {
        const when = at(doc)
        return {
          collection,
          label: labelOf(payload, collection),
          id: doc['id'] as number | string,
          title: titleOf(doc),
          at: typeof when === 'string' ? when : '',
        }
      })
    }),
  )
  const rows: WorkRow[] = []
  for (const result of settled) {
    if (result.status === 'fulfilled') rows.push(...result.value)
    else payload.logger.warn({ err: result.reason }, 'Your work: a collection did not answer.')
  }
  return rows
}

export async function readYourWork(
  payload: Payload,
  options: { work: WorkOptions; user: PayloadRequest['user']; now?: Date },
): Promise<YourWorkResult> {
  const now = options.now ?? new Date()
  const limit = options.work.limit ?? 8
  const scheduledField = options.work.scheduledField ?? 'scheduledPublishAt'
  const common = {
    depth: 0,
    limit,
    draft: true,
    overrideAccess: false,
    user: options.user,
  } as const

  const [changes, scheduled] = await Promise.all([
    rowsFrom(
      payload,
      options.work.collections,
      (collection) =>
        payload.find({
          ...common,
          collection,
          where: { _status: { equals: 'draft' } },
          sort: '-updatedAt',
        }),
      (doc) => doc['updatedAt'],
    ),
    rowsFrom(
      payload,
      options.work.collections,
      (collection) =>
        payload.find({
          ...common,
          collection,
          where: { [scheduledField]: { greater_than: now.toISOString() } },
          sort: scheduledField,
        }),
      (doc) => doc[scheduledField],
    ),
  ])

  return {
    generatedAt: now.toISOString(),
    // Each collection gave its own first `limit`; these are the first across all of them.
    changes: changes.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit),
    scheduled: scheduled.sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit),
  }
}

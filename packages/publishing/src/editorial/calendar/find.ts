import type { CollectionSlug, Payload, PayloadRequest, Where } from 'payload'
import type { CalendarClock } from './month.js'

/*
What the content calendar shows, read for one grid's worth of days. The one read
behind the view and the `get_content_calendar` tool. From forumone-2026's
`admin/calendar/findCalendar.ts` (#761 there), with its collections and field
names made options.

Three kinds of item, each a query the data already answers:

- **Scheduled:** a `scheduledPublishAt` in range. Read with `draft: true`,
  because a schedule is set on a draft and lives on the latest version rather
  than the main row. Once the publish runs the field is cleared, so a scheduled
  item that has gone out shows as published instead.
- **Published:** a `publishedAt` in range on the live row. From the content
  rather than the audit log, which records MCP and pipeline actions but not a
  publish from the admin.
- **Events:** a start in range, with the zone the event was entered in, so the
  label can show both. Read with `draft: true`, so an event still being written
  is on the calendar beside its date, marked as a draft.

Read as the viewer, with `overrideAccess: false`. A collection that fails is
left out and logged rather than failing the page.
*/

export type CalendarKind = 'scheduled' | 'published' | 'event'

export interface CalendarItem {
  kind: CalendarKind
  collection: string
  id: number | string
  title: string
  at: string
  /** The event's own zone, for `timeLabel`. */
  zone?: string
  /** An event that has never been published. */
  draft?: boolean
}

export interface CalendarEventSource {
  collection: CollectionSlug
  /** Default `startsAt`. */
  startsField?: string
  /** The field holding the zone the start was entered in, if any. Payload's own is `<startsField>_tz`. */
  zoneField?: string
}

export interface CalendarSources {
  /** The collections whose scheduled publishes and publishes are shown. */
  collections: readonly CollectionSlug[]
  /** Default `scheduledPublishAt`, the field `publishingPlugin` schedules by. */
  scheduledField?: string
  /** Default `publishedAt`. */
  publishedField?: string
  events?: readonly CalendarEventSource[]
}

const between = (field: string, from: string, to: string): Where => ({
  and: [{ [field]: { greater_than_equal: from } }, { [field]: { less_than: to } }],
})

function titleOf(doc: Record<string, unknown>): string {
  for (const key of ['title', 'name']) {
    const value = doc[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return 'Untitled'
}

/** Every item between `from` and `to`, bucketed by site day and sorted by time. */
export async function findContentCalendar(
  payload: Payload,
  options: {
    sources: CalendarSources
    clock: CalendarClock
    user: PayloadRequest['user']
    range: { from: string; to: string }
  },
): Promise<Map<string, CalendarItem[]>> {
  const { from, to } = options.range
  const scheduledField = options.sources.scheduledField ?? 'scheduledPublishAt'
  const publishedField = options.sources.publishedField ?? 'publishedAt'
  const common = {
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: false,
    user: options.user,
  } as const

  const rows = (docs: unknown[]) => docs as Record<string, unknown>[]
  const reads: Promise<CalendarItem[]>[] = []

  for (const collection of options.sources.collections) {
    reads.push(
      payload
        .find({
          ...common,
          collection,
          draft: true,
          where: between(scheduledField, from, to),
          select: { title: true, name: true, [scheduledField]: true } as never,
        })
        .then(({ docs }) =>
          rows(docs).map((doc) => ({
            kind: 'scheduled' as const,
            collection,
            id: doc['id'] as number | string,
            title: titleOf(doc),
            at: doc[scheduledField] as string,
          })),
        ),
      payload
        .find({
          ...common,
          collection,
          where: { and: [{ _status: { equals: 'published' } }, between(publishedField, from, to)] },
          select: { title: true, name: true, [publishedField]: true } as never,
        })
        .then(({ docs }) =>
          rows(docs).map((doc) => ({
            kind: 'published' as const,
            collection,
            id: doc['id'] as number | string,
            title: titleOf(doc),
            at: doc[publishedField] as string,
          })),
        ),
    )
  }

  for (const source of options.sources.events ?? []) {
    const starts = source.startsField ?? 'startsAt'
    reads.push(
      payload
        .find({
          ...common,
          collection: source.collection,
          draft: true,
          where: between(starts, from, to),
          select: {
            title: true,
            name: true,
            [starts]: true,
            ...(source.zoneField ? { [source.zoneField]: true } : {}),
            _status: true,
            [publishedField]: true,
          } as never,
        })
        .then(({ docs }) =>
          rows(docs).map((doc) => {
            const zone = source.zoneField ? doc[source.zoneField] : undefined
            return {
              kind: 'event' as const,
              collection: source.collection,
              id: doc['id'] as number | string,
              title: titleOf(doc),
              at: doc[starts] as string,
              ...(typeof zone === 'string' ? { zone } : {}),
              // The latest version of a published event with pending edits is
              // a draft; the publish stamp is what says it has been live.
              ...(doc['_status'] !== 'published' && !doc[publishedField] ? { draft: true } : {}),
            }
          }),
        ),
    )
  }

  const settled = await Promise.allSettled(reads)
  const days = new Map<string, CalendarItem[]>()
  for (const result of settled) {
    if (result.status === 'rejected') {
      payload.logger.warn({ err: result.reason }, 'Content calendar: a collection did not answer.')
      continue
    }
    for (const item of result.value) {
      if (typeof item.at !== 'string') continue
      const key = options.clock.dayKey(item.at)
      const list = days.get(key) ?? []
      list.push(item)
      days.set(key, list)
    }
  }
  for (const list of days.values()) list.sort((a, b) => a.at.localeCompare(b.at))
  return days
}

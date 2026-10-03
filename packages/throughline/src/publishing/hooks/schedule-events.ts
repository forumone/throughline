import type { CollectionAfterChangeHook } from 'payload'
import type { Inngest } from 'inngest'
import { sendEventSafely } from '../events.js'

/**
 * Sends `content/page.scheduled` when a document's scheduled publish time is
 * set to a new value, by whatever route — the admin's Schedule control, the
 * `schedule_publish` MCP tool, a REST write.
 *
 * On the collection rather than in the service because the field is the
 * source of truth and the service is only one way to write it. A schedule that
 * could be stored without the event would be a date nothing wakes up for,
 * which is the defect this replaces.
 *
 * Nothing is sent for a cleared or unchanged time. The run sleeping on a
 * schedule re-reads the document when it wakes and publishes only if the
 * stored time is still the one it was started for, so a cancellation needs no
 * event of its own — and an event sent from a transaction that then rolls back
 * wakes a run that finds nothing to do.
 *
 * `previousDoc` is the latest version, not the live document, which is the
 * right comparison here: a schedule lives on the latest version.
 */
export function createSendScheduledEventHook(args: {
  inngest: Inngest
  scheduledPublishField: string
}): CollectionAfterChangeHook {
  const field = args.scheduledPublishField

  return async ({ collection, doc, previousDoc, req }) => {
    const next = instant(doc?.[field])
    if (next === null) return doc
    if (next === instant(previousDoc?.[field])) return doc

    const id = (doc as { id?: unknown }).id
    if (id === undefined || id === null) return doc

    const warning = await sendEventSafely(args.inngest, {
      name: 'content/page.scheduled',
      data: {
        collection: collection.slug,
        id: String(id),
        scheduledFor: new Date(next).toISOString(),
      },
    })
    if (warning) {
      // The schedule is saved; only the on-time wake-up is lost. The daily
      // backstop still finds the document once it is overdue.
      req.payload.logger.warn({ collection: collection.slug, id }, `[publishing] ${warning}`)
    }
    return doc
  }
}

function instant(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

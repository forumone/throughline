import { failureOptions } from './types.js'
import type { InngestFunction } from 'inngest'
import { defineJob } from './jobs/define.js'
import { inngestJobs } from './jobs/inngest.js'
import type { Job } from './jobs/types.js'
import { jobPayload, type JobOptions } from './jobs/options.js'
import type { PublishAtScheduledTimeOptions, ScheduledCollectionConfig } from './types.js'

const SCHEDULED_EVENT = 'content/page.scheduled'
const REASONING = 'Scheduled publish executed at its scheduled time'

/*
Six days, under the seven Inngest's free plan allows a single sleep.

A schedule further out than one hop is carried by a relay: the run sleeps a
hop, then re-sends the event and ends, so each leg is its own run. That also
keeps every run far inside the free plan's thirty-day run duration, which a
loop of sleeps inside one run would not — a post scheduled for next quarter
would simply be killed.
*/
const DEFAULT_MAX_SLEEP_MS = 6 * 24 * 60 * 60 * 1000

interface ScheduledEventData {
  collection: string
  id: string
  scheduledFor: string
}

type Outcome =
  | { outcome: 'published' }
  | { outcome: 'blocked'; reason?: string | undefined }
  | { outcome: 'error'; reason: string }
  | { outcome: 'superseded' }
  | { outcome: 'relayed'; hopUntil: string }
  | { outcome: 'ignored'; reason: string }

/**
 * Publishes a document at the moment it was scheduled for, by sleeping until
 * then — rather than polling for due documents.
 *
 * Triggered by `content/page.scheduled`, which the publishing plugin sends
 * whenever a document's scheduled time changes to a new value. The event is a
 * wake-up call and nothing more: **the document is the source of truth.** On
 * waking, the run re-reads the document's latest version and publishes only if
 * it still carries this exact time. So a reschedule, a cancellation, a manual
 * publish in the meantime or an unpublish — each of which changes or clears
 * the field — leaves the old run to wake, find nothing to do, and end. No
 * cancellation event has to arrive for that to be correct, and a duplicate
 * event cannot publish twice (the `idempotency` key drops the second anyway).
 *
 * `publish` must go through the publishing pipeline, exactly as for
 * `createExecuteScheduledPublishesFunction`: a scheduled publish gets the same
 * composition / accessibility / approval checks as an interactive one, and a
 * refusal is logged, not retried.
 */
export function publishAtScheduledTimeJob(
  options: JobOptions<PublishAtScheduledTimeOptions>,
): Job {
  const maxSleepMs = options.maxSleepMs ?? DEFAULT_MAX_SLEEP_MS
  const collections = new Map(options.collections.map((c) => [c.slug, c]))

  return defineJob(
    {
      id: options.id ?? 'publish-at-scheduled-time',
      /*
      One run per schedule. The plugin sends once per change, but an MCP
      schedule and the field hook seeing the same write, or a retried send,
      would otherwise start two sleepers that both wake and both publish.
      Inngest keeps this key for 24 hours, and a relay is six days after the
      event that started its leg, so a relay is never mistaken for a duplicate.
      */
      idempotency: { fields: ['collection', 'id', 'scheduledFor'] },
      ...failureOptions(options),
      on: { event: SCHEDULED_EVENT },
    },
    async ({ event, step, logger, payload: contextPayload }): Promise<Outcome> => {
      const payload = jobPayload(options.payload, contextPayload, options.id ?? 'publish-at-scheduled-time')
      const data = event.data as Partial<ScheduledEventData>
      const config = data.collection ? collections.get(data.collection) : undefined
      const target = typeof data.scheduledFor === 'string' ? Date.parse(data.scheduledFor) : NaN

      if (!config || !data.id || !data.scheduledFor || Number.isNaN(target)) {
        return { outcome: 'ignored', reason: 'not a scheduled publish this function handles' }
      }
      const request = { collection: config.slug, id: data.id, scheduledFor: data.scheduledFor }

      /*
      Measured from the event's own timestamp, not the clock. Inngest replays
      the handler from the top after every step, so a `Date.now()` here would
      give a different answer on each replay — and flipping from the relay
      branch to the direct branch halfway through a run is a run whose steps
      no longer match its history.
      */
      const startedAt = typeof event.ts === 'number' ? event.ts : Date.now()

      if (target - startedAt > maxSleepMs) {
        const hopUntil = new Date(startedAt + maxSleepMs)
        await step.sleepUntil('wait-one-hop', hopUntil)

        // Only relay a schedule that still stands, or a cancelled one would
        // keep re-sending itself every six days until its date came round.
        const current = await step.run('check-still-scheduled', () =>
          isStillScheduled({ payload }, config, request),
        )
        if (!current) return { outcome: 'superseded' }

        await step.sendEvent('relay', { name: SCHEDULED_EVENT, data: request })
        return { outcome: 'relayed', hopUntil: hopUntil.toISOString() }
      }

      await step.sleepUntil('wait-until-due', new Date(target))

      const due = await step.run('check-still-scheduled', () =>
        isStillScheduled({ payload }, config, request),
      )
      if (!due) {
        logger.info('Scheduled publish superseded', request)
        return { outcome: 'superseded' }
      }

      return step.run('publish', async (): Promise<Outcome> => {
        try {
          const result = await options.publish({
            collection: config.slug,
            id: request.id,
            reasoning: REASONING,
          }, { payload })
          if (!result.published) {
            logger.warn('Scheduled publish blocked by policy', {
              ...request,
              reason: result.reason,
            })
            return { outcome: 'blocked', reason: result.reason }
          }
          logger.info('Scheduled publish succeeded', request)
          return { outcome: 'published' }
        } catch (error) {
          /*
          Not rethrown. A retry would re-run the pipeline against the same
          document, and the daily backstop in
          `createExecuteScheduledPublishesFunction` already comes back for a
          document that is still a draft past its time.
          */
          const reason = error instanceof Error ? error.message : String(error)
          logger.error('Scheduled publish threw', { ...request, error: reason })
          return { outcome: 'error', reason }
        }
      })
    },
  )
}

/** The same job, registered with Inngest exactly as it always was. */
export function createPublishAtScheduledTimeFunction(
  options: PublishAtScheduledTimeOptions,
): InngestFunction.Any {
  return inngestJobs(options.inngest).toFunction(publishAtScheduledTimeJob(options))
}

/**
 * Whether the document's latest version still carries this schedule.
 *
 * `draft: true`, because a schedule is written by a draft save and Payload
 * writes a draft save to the versions table only — the main row is not
 * touched, so a read without it would see a document with no schedule at all.
 */
async function isStillScheduled(
  options: Pick<PublishAtScheduledTimeOptions, 'payload'>,
  config: ScheduledCollectionConfig,
  request: ScheduledEventData,
): Promise<boolean> {
  const field = config.scheduledField ?? 'scheduledPublishAt'
  const doc = (await options.payload.findByID({
    collection: config.slug,
    id: request.id,
    draft: true,
    depth: 0,
    disableErrors: true,
  })) as Record<string, unknown> | null

  const value = doc?.[field]
  if (typeof value !== 'string') return false
  return Date.parse(value) === Date.parse(request.scheduledFor)
}

import { failureOptions } from './types.js'
import type { InngestFunction } from 'inngest'
import type { ExecuteScheduledPublishesOptions } from './types.js'

const DEFAULT_SCHEDULE = '*/5 * * * *'
const REASONING = 'Scheduled publish executed by workflow cron'

interface DueDoc {
  id: string
  title: string
  collection: string
}

/**
 * Cron-driven scheduled publish executor. Every tick (default: every 5
 * minutes) the function looks for documents in any of the configured
 * collections whose `_status` is still `draft` and whose
 * `scheduledPublishAt` has passed, and calls `options.publish` for each.
 *
 * `publish` must go through the publishing pipeline — see the option's own
 * documentation for the wiring. That is what makes a scheduled publish get the
 * same composition / accessibility / approval checks as an interactive one.
 *
 * A refusal is logged and does not throw; the document stays at
 * `_status: draft` until an admin intervenes or a later tick succeeds.
 * Throwing would retry indefinitely on a permanent error (a composition
 * failure, say), which is wrong for cron-style work.
 */
export function createExecuteScheduledPublishesFunction(
  options: ExecuteScheduledPublishesOptions,
): InngestFunction.Any {
  const schedule = options.schedule ?? DEFAULT_SCHEDULE

  return options.inngest.createFunction(
    {
      id: options.id ?? 'execute-scheduled-publishes',
      /*
      One at a time by default, because this reads then acts: `find-due-<slug>`
      collects the documents whose scheduled time has passed, and the publish
      loop runs after. Two overlapping runs both see the same due document and
      both publish it — which for a pipeline that gates on approvals means two
      audit trails for one act, and an `approval.granted` consumed twice.

      The cost of the cap is nil: the poll finds nothing on almost every tick,
      and a run that does find something is the only one that needs to.
      */
      ...failureOptions(options, 1),
      triggers: [{ cron: schedule }],
    },
    async ({ step, logger }) => {
      const nowIso = new Date().toISOString()
      let publishedCount = 0
      let blockedCount = 0

      for (const config of options.collections) {
        const statusField = config.statusField ?? '_status'
        const scheduledField = config.scheduledField ?? 'scheduledPublishAt'

        const due = await step.run(`find-due-${config.slug}`, async (): Promise<DueDoc[]> => {
          const result = await options.payload.find({
            collection: config.slug,
            where: {
              and: [
                { [statusField]: { equals: 'draft' } },
                { [scheduledField]: { exists: true } },
                { [scheduledField]: { less_than_equal: nowIso } },
              ],
            },
            limit: 100,
          })
          return (result.docs as Array<Record<string, unknown>>).map((doc) => ({
            id: String(doc['id']),
            title: String(doc['title'] ?? doc['id']),
            collection: config.slug,
          }))
        })

        for (const doc of due) {
          const outcome = await step.run(
            `publish-${config.slug}-${doc.id}`,
            async (): Promise<'published' | 'blocked' | 'error'> => {
              let result
              try {
                result = await options.publish({
                  collection: doc.collection,
                  id: doc.id,
                  reasoning: REASONING,
                })
              } catch (error) {
                logger.error('Scheduled publish threw', {
                  document: doc.title,
                  error: error instanceof Error ? error.message : String(error),
                })
                return 'error'
              }

              if (!result.published) {
                logger.warn('Scheduled publish blocked by policy', {
                  document: doc.title,
                  reason: result.reason,
                })
                return 'blocked'
              }

              logger.info('Scheduled publish succeeded', { document: doc.title })
              return 'published'
            },
          )
          if (outcome === 'published') publishedCount += 1
          if (outcome === 'blocked') blockedCount += 1
        }
      }

      logger.info('Scheduled publish tick complete', { publishedCount, blockedCount })
      return { publishedCount, blockedCount }
    },
  )
}

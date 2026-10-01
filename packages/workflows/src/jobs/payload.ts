/*
Jobs, as Payload Jobs workflows — the runner that needs nothing but Payload.

Each job becomes one Payload workflow, keyed by the job's id. Most of a job maps
directly, and four things do not, so they are built here:

- **A durable `step.run`.** Payload memoizes an inline task's output across
  retries of the same job, so a step is an inline task named by its id. Its
  value is also carried in the job's input, for the next point.

- **`step.sleepUntil`.** A Payload workflow cannot pause. So a sleep ends this
  job and queues a continuation with `waitUntil`, whose input carries every
  step value so far. The continuation replays the handler; every completed
  step answers from that record instead of running again, and the sleep itself
  is recorded as done. Queueing the continuation is itself an inline task, so a
  retry of this job does not queue a second one.

- **Idempotency.** Payload has no idempotency window. `emit` computes the job's
  key from the event and records it in `throughline-job-keys`, which has a
  unique index, before queueing. A key already held, and not yet expired (24
  hours, as Inngest's window), means the job is not queued again. Its own
  collection rather than a search of `payload-jobs`, because Payload deletes a
  completed job by default, which would empty the window as soon as a job ran.
  The collection is added only when some job declares idempotency.

- **Terminal failure.** Payload workflows have no `onFail`. The handler catches
  the error, calls the failure handler when this was the last attempt, and
  rethrows so Payload records the failure as it always would.

Concurrency is the one place this is *not* Inngest's behaviour. Payload's
control is a lock per key, not a count, so any `concurrency` becomes "one at a
time" for that job. That is the safe direction for every job here (each that
sets it does so to avoid overlapping runs), and the cost is throughput.
Turning it on adds a `concurrencyKey` column to `payload-jobs`, so it needs a
migration in a site that adopts this adapter.

Runs only when something runs Payload's queue: `jobs.autoRun` on a long-lived
server, or a scheduler hitting `/api/payload-jobs/run` and
`/api/payload-jobs/handle-schedules` on serverless hosts such as Vercel.
*/
import type { Config, Payload, Plugin } from 'payload'
import type { WorkflowFailureHandler } from '../types.js'
import type {
  Job,
  JobContext,
  JobEvent,
  JobLogger,
  JobsAdapter,
  ReceivedJobEvent,
} from './types.js'

export interface PayloadJobsOptions {
  /** The Payload queue every job runs on. Default `'throughline'`. */
  queue?: string
  /** Every job's terminal-failure handler, unless the job declares its own. */
  onFailure?: WorkflowFailureHandler
  /** How long an idempotency key holds. Default 24 hours, matching Inngest. */
  idempotencyWindowMs?: number
}

export interface PayloadJobsAdapter extends JobsAdapter {
  readonly runner: 'payload'
  /**
   * The Payload plugin that registers `jobs` as workflows. Add it to the
   * config's `plugins`; `emit` works once Payload has initialised.
   */
  plugin(jobs: readonly Job[]): Plugin
}

/** What a queued job carries. */
interface PayloadJobInput {
  event?: ReceivedJobEvent
  /** Every step value so far, carried into a continuation after a sleep. */
  steps?: Record<string, unknown>
  /** The job's idempotency key, when it declares one. */
  idempotencyKey?: string
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Where idempotency keys are held. Added only when a job declares one. */
export const JOB_KEYS_COLLECTION = 'throughline-job-keys'
const SLEPT = 'slept'

/** Thrown by `step.sleepUntil` to end this job once its continuation is queued. */
class SleepingUntil extends Error {
  constructor() {
    super('Sleeping until a continuation runs.')
    this.name = 'SleepingUntil'
  }
}

/** Payload's logger is pino, which takes the context first. */
function jobLogger(payload: Payload): JobLogger {
  const log = payload.logger
  return {
    debug: (message, context) => log.debug(context ?? {}, message),
    info: (message, context) => log.info(context ?? {}, message),
    warn: (message, context) => log.warn(context ?? {}, message),
    error: (message, context) => log.error(context ?? {}, message),
  }
}

/** A job's idempotency key for an event, as `inngestIdempotency` would key it. */
export function payloadIdempotencyKey(job: Job, event: JobEvent): string | undefined {
  if (!job.idempotency) return undefined
  const data = (event.data ?? {}) as Record<string, unknown>
  const values = job.idempotency.fields.map((field) =>
    String(
      field
        .split('.')
        .reduce<unknown>(
          (value, key) => (value as Record<string, unknown> | undefined)?.[key],
          data,
        ),
    ),
  )
  return `${job.id}:${values.join(job.idempotency.separator ?? ':')}`
}

/**
 * Run jobs on Payload's own queue.
 *
 * ```ts
 * const jobs = payloadJobs({ onFailure: createTerminalFailureHandler({ payload }) })
 * export default buildConfig({ plugins: [jobs.plugin(allJobs)], jobs: { autoRun: [{ cron: '* * * * *' }] } })
 * ```
 */
export function payloadJobs(options: PayloadJobsOptions = {}): PayloadJobsAdapter {
  const queue = options.queue ?? 'throughline'
  const windowMs = options.idempotencyWindowMs ?? DAY_MS
  let registered: readonly Job[] = []
  let payloadRef: Payload | undefined

  const requirePayload = (): Payload => {
    if (!payloadRef) throw new Error('payloadJobs: emit() was called before Payload initialised.')
    return payloadRef
  }

  /**
   * Claim a key for the window. False when it is already held: the unique
   * index makes two concurrent claims of one key resolve to one winner.
   */
  async function claim(payload: Payload, key: string): Promise<boolean> {
    const collection = JOB_KEYS_COLLECTION as never
    const { docs } = await payload.find({
      collection,
      where: { key: { equals: key } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const held = docs[0] as { id: number | string; expiresAt?: string } | undefined
    if (held) {
      if (held.expiresAt && Date.parse(held.expiresAt) > Date.now()) return false
      await payload.delete({ collection, id: held.id, overrideAccess: true })
    }
    try {
      await payload.create({
        collection,
        data: { key, expiresAt: new Date(Date.now() + windowMs).toISOString() } as never,
        overrideAccess: true,
      })
      return true
    } catch {
      // Another emit claimed it between the read and the write.
      return false
    }
  }

  async function emit(event: JobEvent | readonly JobEvent[]): Promise<void> {
    const payload = requirePayload()
    const events = Array.isArray(event) ? event : [event as JobEvent]
    for (const sent of events) {
      const received: ReceivedJobEvent = { name: sent.name, data: sent.data, ts: Date.now() }
      for (const job of registered) {
        if (!('event' in job.on) || job.on.event !== sent.name) continue
        const idempotencyKey = payloadIdempotencyKey(job, sent)
        if (idempotencyKey && !(await claim(payload, idempotencyKey))) continue
        await payload.jobs.queue({
          workflow: job.id as never,
          queue,
          input: { event: received, ...(idempotencyKey ? { idempotencyKey } : {}) } as never,
          overrideAccess: true,
        })
      }
    }
  }

  function workflowFor(job: Job): NonNullable<NonNullable<Config['jobs']>['workflows']>[number] {
    const onFailure = job.onFailure ?? options.onFailure
    const retries = job.retries ?? 3

    return {
      slug: job.id,
      queue,
      retries,
      ...('cron' in job.on ? { schedule: [{ cron: job.on.cron, queue }] } : {}),
      ...(job.concurrency !== undefined
        ? { concurrency: { key: () => job.id, exclusive: true } }
        : {}),
      handler: async ({ job: running, inlineTask, req }) => {
        const input = (running.input ?? {}) as PayloadJobInput
        const steps: Record<string, unknown> = { ...input.steps }
        const event: ReceivedJobEvent = input.event ?? {
          name: 'cron',
          data: {},
          ts: Date.parse(running.createdAt),
        }

        const run = async <T>(id: string, fn: () => Promise<T> | T): Promise<T> => {
          if (Object.hasOwn(steps, id)) return steps[id] as T
          const output = (await inlineTask(id, {
            task: async () => ({ output: { value: await fn() } }),
          })) as { value: T }
          steps[id] = output.value
          return output.value
        }

        const context: JobContext = {
          event,
          runId: String(running.id),
          logger: jobLogger(req.payload),
          step: {
            run,
            sleepUntil: async (id, until) => {
              const key = `sleep:${id}`
              if (steps[key] === SLEPT) return
              if (until.getTime() <= Date.now()) {
                steps[key] = SLEPT
                return
              }
              await inlineTask(key, {
                task: async () => {
                  await req.payload.jobs.queue({
                    workflow: job.id as never,
                    queue,
                    waitUntil: until,
                    input: { ...input, steps: { ...steps, [key]: SLEPT } } as never,
                    overrideAccess: true,
                  })
                  return { output: {} }
                },
              })
              throw new SleepingUntil()
            },
            sendEvent: async (id, sent) => {
              await run(`send:${id}`, async () => {
                await emit(sent)
                return true
              })
            },
          },
        }

        try {
          await job.handler(context)
        } catch (error) {
          if (error instanceof SleepingUntil) return
          // Payload marks the failure final once totalTried reaches retries;
          // this attempt is counted after it fails, hence the + 1.
          const final = (running.totalTried ?? 0) + 1 > retries
          if (final && onFailure) {
            try {
              await onFailure({
                error: error instanceof Error ? error : new Error(String(error)),
                event: {
                  data: {
                    function_id: job.id,
                    run_id: String(running.id),
                    event: { name: event.name },
                  },
                },
              })
            } catch {
              // A failure handler that throws must not mask the failure itself.
            }
          }
          throw error
        }
      },
    }
  }

  return {
    runner: 'payload',
    emit,
    plugin: (jobs) => {
      const seen = new Set<string>()
      for (const job of jobs) {
        if (seen.has(job.id)) throw new Error(`Two jobs share the id "${job.id}".`)
        seen.add(job.id)
      }
      registered = jobs
      const keys = jobs.some((job) => job.idempotency)
      return (incoming) => ({
        ...incoming,
        collections: [
          ...(incoming.collections ?? []),
          ...(keys
            ? [
                {
                  slug: JOB_KEYS_COLLECTION,
                  admin: { hidden: true },
                  // Written and read only here, with overrideAccess.
                  access: {
                    read: () => false,
                    create: () => false,
                    update: () => false,
                    delete: () => false,
                  },
                  fields: [
                    {
                      name: 'key',
                      type: 'text' as const,
                      required: true,
                      unique: true,
                      index: true,
                    },
                    { name: 'expiresAt', type: 'date' as const, required: true, index: true },
                  ],
                },
              ]
            : []),
        ],
        jobs: {
          ...incoming.jobs,
          ...(jobs.some((job) => job.concurrency !== undefined)
            ? { enableConcurrencyControl: true }
            : {}),
          workflows: [...(incoming.jobs?.workflows ?? []), ...jobs.map(workflowFor)],
        },
        onInit: async (payload) => {
          await incoming.onInit?.(payload)
          payloadRef = payload
        },
      })
    },
  }
}

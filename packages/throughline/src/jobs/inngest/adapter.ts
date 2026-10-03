/*
Jobs, as Inngest functions.

The point of this adapter is that moving a function onto it changes nothing
Inngest can see. Inngest keys a function's run history, its in-flight sleeps
and its idempotency window on what it is registered with, so the config built
here is the config the function had: the same id, the same trigger, and an
idempotency expression compiled back to the CEL string it was written as. A
scheduled publish sleeping in a run started before the deploy wakes in a
function that still answers to its name.

`onFailure` is the one place this adapter adds anything. A host passes its
failure handler once, here, and every job gets it unless the job names its own,
instead of threading `onTerminalFailure` into every factory.
*/
import type { Inngest, InngestFunction } from 'inngest'
import type { Payload } from 'payload'
import type { WorkflowFailureHandler } from '../workflow-types.js'
import type { Job, JobContext, JobEvent, JobIdempotency, JobLogger, JobsAdapter } from '../types.js'

export interface InngestJobsOptions {
  /** Every job's terminal-failure handler, unless the job declares its own. */
  onFailure?: WorkflowFailureHandler
  /** Handed to every job as `context.payload`. */
  payload?: Payload
}

export interface InngestJobsAdapter extends JobsAdapter {
  readonly runner: 'inngest'
  /** The Inngest function for one job. */
  toFunction(job: Job): InngestFunction.Any
  /** The Inngest functions for many, in order, for `serve({ functions })`. */
  functions(jobs: readonly Job[]): InngestFunction.Any[]
}

/**
 * Inngest's idempotency expression for a field list:
 * `{ fields: ['collection', 'id'], separator: '/' }` becomes
 * `event.data.collection + "/" + event.data.id`.
 */
export function inngestIdempotency(idempotency: JobIdempotency): string {
  const separator = JSON.stringify(idempotency.separator ?? ':')
  return idempotency.fields.map((field) => `event.data.${field}`).join(` + ${separator} + `)
}

/** The config `createFunction` receives, built once so tests can read it. */
export function inngestFunctionConfig(
  job: Job,
  options: InngestJobsOptions = {},
): Record<string, unknown> & { id: string } {
  const onFailure = job.onFailure ?? options.onFailure
  return {
    id: job.id,
    // Each key only when set: `exactOptionalPropertyTypes` is on, and Inngest
    // reads the presence of a key, so `undefined` is not the same as absent.
    ...(job.retries !== undefined ? { retries: job.retries } : {}),
    ...(job.concurrency !== undefined ? { concurrency: job.concurrency } : {}),
    ...(job.idempotency ? { idempotency: inngestIdempotency(job.idempotency) } : {}),
    ...(onFailure ? { onFailure } : {}),
    triggers:
      'event' in job.on ? jobEvents(job).map((event) => ({ event })) : [{ cron: job.on.cron }],
  }
}

interface InngestHandlerArgs {
  event: { name: string; data: unknown; ts?: number }
  step: {
    run: (id: string, fn: () => unknown) => Promise<unknown>
    sleepUntil: (id: string, until: Date) => Promise<unknown>
    sendEvent: (id: string, event: unknown) => Promise<unknown>
  }
  runId?: string
  logger: JobLogger
}

/** The event names a job answers, as a list. Empty for a cron job. */
export function jobEvents(job: Job): readonly string[] {
  if (!('event' in job.on)) return []
  return typeof job.on.event === 'string' ? [job.on.event] : job.on.event
}

/** Inngest's handler arguments, as a job's context. */
function toContext(
  args: InngestHandlerArgs,
  emit: JobContext['emit'],
  payload: Payload | undefined,
): JobContext {
  return {
    event: {
      name: args.event.name,
      data: args.event.data,
      ...(typeof args.event.ts === 'number' ? { ts: args.event.ts } : {}),
    },
    step: {
      run: (id, fn) => args.step.run(id, fn) as Promise<never>,
      sleepUntil: async (id, until) => {
        await args.step.sleepUntil(id, until)
      },
      sendEvent: async (id, event) => {
        await args.step.sendEvent(id, Array.isArray(event) ? [...event] : event)
      },
    },
    runId: args.runId ?? 'unknown',
    logger: args.logger,
    emit,
    ...(payload ? { payload } : {}),
  }
}

/**
 * Run jobs on Inngest.
 *
 * ```ts
 * const jobs = inngestJobs(inngest, { onFailure: createTerminalFailureHandler({ payload }) })
 * export const { GET, POST, PUT } = serve({ client: inngest, functions: jobs.functions(allJobs) })
 * ```
 */
export function inngestJobs(
  inngest: Inngest,
  options: InngestJobsOptions = {},
): InngestJobsAdapter {
  const emit = async (event: JobEvent | readonly JobEvent[]): Promise<void> => {
    await inngest.send(Array.isArray(event) ? [...event] : (event as JobEvent))
  }
  const toFunction = (job: Job): InngestFunction.Any =>
    (
      inngest.createFunction as unknown as (
        config: Record<string, unknown>,
        handler: (args: InngestHandlerArgs) => Promise<unknown>,
      ) => InngestFunction.Any
    )(inngestFunctionConfig(job, options), (args) =>
      job.handler(toContext(args, emit, options.payload)),
    )

  return {
    runner: 'inngest',
    toFunction,
    functions: (jobs) => {
      const seen = new Set<string>()
      for (const job of jobs) {
        if (seen.has(job.id)) throw new Error(`Two jobs share the id "${job.id}".`)
        seen.add(job.id)
      }
      return jobs.map(toFunction)
    },
    emit,
  }
}

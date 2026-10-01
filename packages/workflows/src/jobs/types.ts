/*
A background job, described once and run by whichever runner the site picked.

Throughline's background work has been Inngest functions, so a site could not
use any of it without adopting Inngest. This is the seam that ends that: a job
says what it reacts to, how it retries and what it does, and an adapter turns
it into an Inngest function (`inngestJobs`) or, later, a Payload Jobs workflow.

The surface is deliberately what Throughline's own functions use and nothing
more. Across this repository and forumone-2026 there were 22 functions; they
read `id`, an event or cron trigger, `retries`, `concurrency`, `idempotency`
and `onFailure`, and inside the handler `step.run`, `step.sleepUntil` and
`step.sendEvent`. An option no runner-neutral job needs is an option every
adapter would have to fake.

No Payload instance on the context, on purpose. A job that needs one closes
over it, the way every workflow factory here already takes `payload` in its
options. That keeps this layer free of anything a runner has to supply.
*/
import type { WorkflowFailureHandler } from '../types.js'

/**
 * What a job reacts to: a named event, any of several, or a cron schedule.
 * `revalidate-on-publish` is the case for a list: it answers publish,
 * unpublish and rollback alike.
 */
export type JobTrigger = { event: string | readonly string[] } | { cron: string }

/**
 * Runs of a job with the same key, within the runner's window, collapse into
 * one.
 *
 * Declared as `event.data` fields rather than as an expression, because the
 * two runners disagree about expressions: Inngest evaluates a CEL string,
 * Payload Jobs has none. `{ fields: ['collection', 'id'], separator: '/' }`
 * compiles to Inngest's `event.data.collection + "/" + event.data.id`, so a
 * job that moves onto this keeps the key it had.
 */
export interface JobIdempotency {
  fields: readonly string[]
  /** Between field values. Default `':'`. */
  separator?: string
}

export interface JobDefinition {
  /** Stable across deploys: a runner keys a run's history and its in-flight sleeps on it. */
  id: string
  on: JobTrigger
  /** Attempts after the first. The runner's default when omitted. */
  retries?: number
  /** Most runs at once. Unlimited when omitted. */
  concurrency?: number
  idempotency?: JobIdempotency
  /**
   * Called once when a run has exhausted its retries. Overrides the adapter's
   * own `onFailure` for this job.
   */
  onFailure?: WorkflowFailureHandler
}

/** An event, as a job receives it and as it sends one. */
export interface JobEvent<TData = unknown> {
  name: string
  data: TData
}

export interface ReceivedJobEvent<TData = unknown> extends JobEvent<TData> {
  /**
   * When the event was sent, in epoch milliseconds, when the runner knows.
   * Use it instead of the clock for anything a replay must agree on: a runner
   * may run the handler from the top again after each step.
   */
  ts?: number
}

/**
 * The durable steps. A step's id names it in the run's history, so it must be
 * unique within the job and stable across deploys, and a completed step is not
 * run again when the handler replays.
 */
export interface JobStep {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
  sleepUntil(id: string, until: Date): Promise<void>
  sendEvent(id: string, event: JobEvent | readonly JobEvent[]): Promise<void>
}

export interface JobLogger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

export interface JobContext<TData = unknown> {
  event: ReceivedJobEvent<TData>
  step: JobStep
  /**
   * Send an event now, not as a step of its own. For a send that belongs to
   * the step it is inside: expiring an approval updates the row, writes the
   * audit event and announces it in one `step.run`, so a retry repeats all
   * three together. Outside a step, prefer `step.sendEvent`, which a replay
   * does not repeat.
   */
  emit(event: JobEvent | readonly JobEvent[]): Promise<void>
  /** The runner's id for this run, for logs and failure reports. */
  runId: string
  logger: JobLogger
}

export type JobHandler<TData = unknown, TResult = unknown> = (
  context: JobContext<TData>,
) => Promise<TResult>

/** A job, ready for an adapter. Made by `defineJob`. */
export interface Job<TData = unknown, TResult = unknown> extends JobDefinition {
  readonly handler: JobHandler<TData, TResult>
}

/** What every adapter offers, whatever it registers with its runner. */
export interface JobsAdapter {
  /** Which runner this is, for logs and for a host that branches on it. */
  readonly runner: 'inngest' | 'payload'
  /** Send events from outside a job: a Payload hook, a route, a seed. */
  emit(event: JobEvent | readonly JobEvent[]): Promise<void>
}

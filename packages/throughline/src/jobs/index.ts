/**
 * `@forumone/throughline/jobs`: background work written once and run on either
 * adapter, `inngestJobs` (`/jobs/inngest`) or `payloadJobs` (`/jobs/payload`).
 * The platform's own jobs live with their owners: `/publishing`, `/approvals`,
 * `/audit` and `/integrations`.
 *
 * Extend the event taxonomy with module augmentation:
 *
 * ```ts
 * declare module '@forumone/throughline/jobs' {
 *   interface CoreEvents { 'site/thing.happened': { id: string } }
 * }
 * ```
 *
 * Nothing here loads a runner: `inngest` appears only as a type.
 */
export type { CoreEvents, FrameworkEvents } from '../events/taxonomy.js'

export { defineJob } from './define.js'
export { eventSenderFor } from './sender.js'
export { jobEvents } from './inngest/adapter.js'
export { jobPayload } from './options.js'
export type { JobOptions } from './options.js'
export type {
  Job,
  JobContext,
  JobDefinition,
  JobEvent,
  JobHandler,
  JobIdempotency,
  JobLogger,
  JobStep,
  JobsAdapter,
  JobTrigger,
  ReceivedJobEvent,
} from './types.js'

export { failureOptions } from './workflow-types.js'
export type {
  BaseWorkflowOptions,
  FailureAwareOptions,
  WorkflowFailureHandler,
} from './workflow-types.js'

export { createHealthcheckFailureHandler, createTerminalFailureHandler } from './failure-handler.js'
export type { FailureHandlerOptions, HealthcheckFailureHandlerOptions } from './failure-handler.js'

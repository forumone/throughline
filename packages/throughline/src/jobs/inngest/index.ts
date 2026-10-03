/**
 * `@forumone/throughline/jobs/inngest`: jobs on Inngest. `inngestJobs` keeps
 * every platform job's function id, so a run in flight survives an upgrade.
 * Also the Inngest client, and the Vercel environment pinning that keeps a
 * preview from registering crons.
 *
 * Kept off the package root so a site running on Payload Jobs never loads
 * `inngest`.
 */
export { inngestFunctionConfig, inngestIdempotency, inngestJobs } from './adapter.js'
export type { InngestJobsAdapter, InngestJobsOptions } from './adapter.js'

export { createInngestClient } from '../../events/inngest.js'
export type { InngestClientOptions } from '../../events/inngest.js'
export {
  registersInngestCrons,
  registrableInngestFunctions,
  resolveInngestEnv,
} from '../../events/vercel.js'

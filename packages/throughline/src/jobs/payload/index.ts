/**
 * `@forumone/throughline/jobs/payload`: jobs on Payload's own queue. On Vercel
 * it needs a per-minute cron calling Payload's run endpoint; elsewhere it runs
 * with `autoRun`.
 */
export { JOB_KEYS_COLLECTION, payloadIdempotencyKey, payloadJobs } from './adapter.js'
export type { PayloadJobsAdapter, PayloadJobsOptions } from './adapter.js'

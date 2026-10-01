---
'@forumone/throughline-workflows': minor
---

Adds `payloadJobs()`, which runs `defineJob` jobs on Payload's own job queue, so a site can use Throughline's background work without Inngest. This is additive: nothing existing changes.

- `plugin(jobs)` registers each job as a Payload workflow, with cron jobs on Payload's schedule. `emit()` queues one job per subscriber to an event.
- `step.run` is an inline task, so its output is memoized across retries.
- `step.sleepUntil` ends the job and queues a continuation with `waitUntil`. The continuation carries every step value, so nothing before the sleep runs again.
- Idempotency is kept in a `throughline-job-keys` collection with a unique index, for 24 hours by default. It is a collection of its own because Payload deletes completed jobs. The collection is added only when some job declares idempotency.
- `onFailure` runs once, on the final attempt.
- `concurrency` becomes "one at a time" for the job, because Payload's control is a per-key lock, not a count. Setting it turns on `enableConcurrencyControl`, which adds a column to `payload-jobs`, so a site adopting this needs a migration.
- Something has to run Payload's queue: `jobs.autoRun` on a long-lived server, or a scheduler calling `/api/payload-jobs/run` and `/api/payload-jobs/handle-schedules` on Vercel.

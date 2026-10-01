---
'@forumone/throughline-workflows': minor
---

Every workflow is now also a runner-neutral job, so it runs on `payloadJobs()` as well as on Inngest.

- `revalidateOnPublishJob`, `executeScheduledPublishesJob`, `publishAtScheduledTimeJob`, `expireStaleApprovalsJob`, `auditEventEchoJob` and `healthcheckJob` take the same options as their `create…Function` factory, without `inngest`.
- The factories keep their signatures. Each now registers `inngestJobs(inngest).toFunction(theJob(options))`, and the config it registers is unchanged: a snapshot test written from the old factories holds every id, trigger, idempotency key, concurrency and retry count.
- A job may answer several events, as `on: { event: [...] }`, the way `revalidate-on-publish` answers publish, unpublish and rollback.
- The job context gains `emit()`, for a send that belongs to the step it sits inside, as when expiring an approval also announces it.
- `jobEvents(job)` lists the events a job answers.

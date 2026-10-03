---
'@forumone/throughline': major
---

Jobs move in from `@forumone/throughline-workflows`, split by owner, by `docs/spec/1.0-exports.md`:

- `defineJob`, the job types, `jobPayload`, `eventSenderFor`, `failureOptions` and the two failure handlers are on `@forumone/throughline/jobs`.
- `inngestJobs` is on `/jobs/inngest`, beside the Inngest client; `payloadJobs` is on `/jobs/payload`.
- `revalidateOnPublishJob`, `publishAtScheduledTimeJob`, `executeScheduledPublishesJob` and `createTagRevalidationHooks` are on `/publishing`; `expireStaleApprovalsJob` on `/approvals`; `auditEventEchoJob` on `/audit`; `healthcheckJob` and its checks on `/integrations`.
- `createCacheTags` is on `/cache-tags`, which still imports nothing.

**Removed:** the six Inngest-shaped factories, `createRevalidateOnPublishFunction`, `createPublishAtScheduledTimeFunction`, `createExecuteScheduledPublishesFunction`, `createExpireStaleApprovalsFunction`, `createAuditEventEchoFunction` and `createHealthcheckFunction`. Each was `inngestJobs(inngest).toFunction(<job>(options))`; write that instead, or better, give the adapter `onFailure` and `payload` once and pass the jobs to `jobs.functions([...])`. Function ids are unchanged. `BaseWorkflowOptions` and `AuditEventEchoOptions` no longer take an `inngest`.

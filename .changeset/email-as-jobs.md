---
'@forumone/throughline-email': minor
'@forumone/throughline-workflows': minor
---

The approval notifications run on any jobs runner.

- **email:**
  - `notifyApprovalRequestJob`, `notifyApprovalDecisionJob` and `notifyApprovalExpiredJob` are the three notifications as runner-neutral jobs. Each takes a resolver for its dependencies.
  - The `create…Function` factories keep their signatures and their Inngest registration, held by a snapshot written before the port.
  - `emailJobs(options)` returns all three for a site that hands its jobs to `payloadJobs().plugin(...)`. They find Payload on the job context and the email client on Payload, so `emailPlugin` must be registered too.
  - `inngest` is now optional on `emailPlugin`. Without it, the plugin registers no Inngest functions, and the site runs `emailJobs` instead.
- **workflows:** the job context carries `payload` when the runner has one: always on Payload Jobs, and on Inngest when `inngestJobs(inngest, { payload })` is given it. This is for jobs a plugin declares before Payload exists.

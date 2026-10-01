---
'@forumone/throughline-workflows': minor
---

Lets a site run every workflow on Payload Jobs, configured before Payload exists. Additive: every existing call keeps working.

- `payload` is optional on the job builders for the healthcheck, publish revalidation, scheduled publishing and its backstop, and approval expiry. Without it, a job uses the Payload instance on its run context, so it can be declared in `buildConfig`. `jobPayload()` and `JobOptions` are exported for jobs written the same way. A job with neither throws an error that names it.
- `publish` (the scheduled-publish callback) now gets a second argument, `{ payload }`, so it no longer has to close over an instance.
- `eventSenderFor(jobs)` returns an Inngest-shaped client that only sends, through a jobs adapter's `emit`. It is for the plugins that take an `inngest` only to announce events (audit, approvals, publishing) on a site with no Inngest. It is transitional, and 1.0 replaces those options with the adapter itself.

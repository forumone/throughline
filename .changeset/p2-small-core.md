---
'@forumone/throughline-core': minor
'@forumone/throughline-email': minor
'@forumone/throughline-integrations': minor
---

Three small 1.0 P2 items. Additive.

- **`hardenCoreCollections(config, { canLock? })`** (core), moved from forumone-2026. It narrows `payload-locked-documents`, which Payload ships open to any authenticated principal, to editors and admins. Before, an approver or an MCP API key could delete the locks that `overrideLock: false` depends on, or lock every document. Apply it to the sanitized config: `buildConfig({...}).then(hardenCoreCollections)`. It throws if Payload ever renames the collection, rather than becoming a no-op.
- **`list_job_failures`** (core): `jobFailuresPlugin({ mcpTools })` adds an MCP tool over the `job-failures` collection. It lists what failed, most recent first, filtered by `source`, `kind` or `sinceHours`, and reads as the caller, so the collection's read rule (admins, by default) decides who sees it.
- **Terminal-failure handlers for the email and webhook functions.** `emailPlugin`'s three notifications and the webhook integration's two functions ran with no `onFailure`, so a run that exhausted its retries was silent. Both now default to `createTerminalFailureHandler({ payload })`, which records a `job-failures` row, logs and reports. `emailPlugin` and `integrationsPlugin` take `onTerminalFailure` to replace it. Integrations get it as `ctx.onFailure`, for their own functions: `inngestJobs(ctx.inngest, { onFailure: ctx.onFailure })`. Function ids and triggers are unchanged; Inngest adds a "(failure)" registration for each.

---
'@forumone/throughline-workflows': minor
---

`onTerminalFailure` has a handler to pass it. `createTerminalFailureHandler({ payload })` logs a run that exhausted its retries, writes a `job-failures` row through core's `jobFailuresPlugin` when it is registered, and posts the report to `ERROR_WEBHOOK_URL`. `createHealthcheckFailureHandler({ payload })` does the same for the healthcheck's per-run `onFailure`. Neither throws, because a throwing `onFailure` is retried by Inngest. The terminal handler also works as the `onFailure` of any Inngest function.

Recording rows needs core's `jobFailuresPlugin` and its migration. Without the plugin, the handlers still log and report.

---
'@forumone/throughline-core': minor
---

A failed background job has somewhere to be recorded, and core can report errors.

- **`job-failures` collection.** `jobFailuresPlugin()` from the new `@forumone/throughline-core/observability` subpath adds a read-only `job-failures` collection (admin-only by default) and attaches a writer that never throws; a row it cannot write is logged at `error` with the failure's summary and message. It is deliberately not the audit log: `audit-events` records MCP tool calls, its `mcpServer` column is required and constrained to MCP server names, and a cron that wrote there with any other value was rejected by Payload and silently dropped.
- **Error reporting.** `createErrorReporter` / `reportError` post JSON reports to `ERROR_WEBHOOK_URL` (or a URL you pass), with a one-line `text` so a Slack incoming webhook works as-is, a 3-second timeout, and no throw on any failure. `buildRequestErrorReport` shapes what Next's `onRequestError` receives and copies request headers from an allowlist; `authorization`, `cookie`, `x-api-key` and `x-forwarded-for` are never copied. `describeErrorReporting` gives a boot-log sentence for on, off or misconfigured.

**Migration required.** Registering `jobFailuresPlugin` adds a table (`job_failures`) and an enum (`enum_job_failures_kind`). Run `payload migrate:create` after adding it and commit the migration. The audit collection is unchanged.

---
'@forumone/throughline': major
---

`throughline()`: one call for the whole suite (`docs/spec/1.0-throughline-call.md`). It returns `{ plugin, mcpTools, jobs }`: one Payload plugin that registers every enabled Throughline plugin in order, the tool array for `mcpPlugin`, and every job the options call for. Audit, job failures and `check_slug` are always on; every other plugin is on when its key is present. Shared values are given once: `approvals.collectionSlug` reaches the collection, the emails and the expiry job, and `collections` reaches publishing, "Your work" and scheduled publishing. Its defaults are what every site wrote by hand: scheduled publishes go through the publishing pipeline (`publishScheduledThroughPipeline`), approval links are signed with approvals' secret, and a failing healthcheck is recorded in `job-failures`. On Payload Jobs it registers its jobs itself. It refuses an integration with no `createJobs`.

**Internal now:** `getPluginRegistry`, `resolveAdminGroup`, `DEFAULT_ADMIN_GROUP`, `PluginRegistry*`, `createMcpToolCollector` and the collector's option types, `toPayloadMcpTool(s)`, `getEmailFunctions`, `getIntegrationRegistry` and `getIntegrationContext`. Use `throughline()`. `McpToolCollector` and `PayloadMcpTool` stay exported as types.

`HealthcheckOptions.onFailure` receives `{ payload }` as a second argument, and `createHealthcheckFailureHandler()` made without a `payload` records on the run's own.

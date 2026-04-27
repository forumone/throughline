---
'@forumone/throughline-workflows': minor
---

Initial release of the workflows package. Five composable Inngest function factories for the common async work in the framework: `createRevalidateOnPublishFunction` (Next.js cache invalidation on publish), `createExecuteScheduledPublishesFunction` (cron-driven scheduled publishes that go through the Publishing Server's MCP for full pipeline coverage), `createExpireStaleApprovalsFunction` (daily approval expiration with audit + `approval/expired` event), `createAuditEventEchoFunction` (fan-out for approval lifecycle plus pluggable custom handlers), `createHealthcheckFunction` (configurable checks with `onFailure` routing and a `system/healthcheck` heartbeat). Plus reusable `createPayloadReachableCheck` and `createManifestReachableCheck` helpers. No Payload plugin — factories only; client apps merge the functions into their Inngest endpoint. `next` is an optional peer dependency.

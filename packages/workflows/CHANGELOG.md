# @forumone/throughline-workflows

## 0.2.8

### Patch Changes

- Updated dependencies [a9262da]
  - @forumone/throughline-core@0.8.0

## 0.2.7

### Patch Changes

- Updated dependencies [3140ea0]
  - @forumone/throughline-core@0.7.0

## 0.2.6

### Patch Changes

- Updated dependencies [9131065]
  - @forumone/throughline-core@0.6.0

## 0.2.5

### Patch Changes

- Updated dependencies [1a4a441]
  - @forumone/throughline-core@0.5.0

## 0.2.4

### Patch Changes

- Updated dependencies [40839b5]
- Updated dependencies [9f39ace]
- Updated dependencies [f138b3d]
- Updated dependencies [6fac789]
  - @forumone/throughline-core@0.4.0

## 0.2.3

### Patch Changes

- Updated dependencies [d20f909]
  - @forumone/throughline-core@0.3.0

## 0.2.2

### Patch Changes

- Updated dependencies [7ee992d]
  - @forumone/throughline-core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1

## 0.2.0

### Minor Changes

- 28f5af4: Initial release of the workflows package. Five composable Inngest function factories for the common async work in the framework: `createRevalidateOnPublishFunction` (Next.js cache invalidation on publish), `createExecuteScheduledPublishesFunction` (cron-driven scheduled publishes that go through the Publishing Server's MCP for full pipeline coverage), `createExpireStaleApprovalsFunction` (daily approval expiration with audit + `approval/expired` event), `createAuditEventEchoFunction` (fan-out for approval lifecycle plus pluggable custom handlers), `createHealthcheckFunction` (configurable checks with `onFailure` routing and a `system/healthcheck` heartbeat). Plus reusable `createPayloadReachableCheck` and `createManifestReachableCheck` helpers. No Payload plugin — factories only; client apps merge the functions into their Inngest endpoint. `next` is an optional peer dependency.

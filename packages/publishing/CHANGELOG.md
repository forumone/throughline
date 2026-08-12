# @forumone/throughline-publishing

## 0.3.0

### Minor Changes

- 422b970: Ship the admin Publish/Unpublish controls and a server-side publishing API.

  `publishingPlugin` blocked direct writes to `_status` — which is what Payload's native Publish button submits — but shipped no replacement, so no document in a publishable collection could be published from the admin. The pipeline was reachable only over the MCP endpoint, which requires an API key.
  - **Admin controls.** The plugin now installs its own `PublishButton` and `UnpublishButton` on every configured collection, exported from `@forumone/throughline-publishing/client`. They run the pipeline as the logged-in editor over the session cookie — no API key, correct audit attribution — and render the failing step, its issues and its suggestion instead of a generic error. Hosts must run `payload generate:importmap`. Opt out with `adminComponents: false`; an explicit host-set slot is never overwritten.
  - **Server-side API.** `publishDocument`, `unpublishDocument`, `getPublishStatus` and `getPublishingService` are now public, for host code that needs to publish outside the admin.
  - **Audit attribution.** Publishes are attributed to the user who made them rather than to the API key that transported the call. Admin publishes record `mcpTool: 'admin:publish'`.
  - **Access control.** Admin and host-API publishes run the underlying write with `overrideAccess: false` as that user, so bypassing the status hook does not bypass collection permissions.
  - **Diagnosis.** The status-write hook now throws `APIError(…, 400)` rather than `Error`, so the message reaches the admin instead of becoming a 500 and a generic "Something went wrong" toast.

  The MCP tools now route through the same service as the admin path, so the two channels cannot drift. Their input and output shapes are unchanged.

## 0.2.3

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

- Updated dependencies [7ee992d]
  - @forumone/throughline-plugin-contract@0.2.1
  - @forumone/throughline-core@0.2.2

## 0.2.2

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1

## 0.2.1

### Patch Changes

- 3ef6f6a: The pipeline's `approvalStep` now falls back to looking up an approval resolver on the Payload instance under `Symbol.for('@forumone/throughline/approvals-resolver')` when no resolver is supplied via `publishingPlugin`'s `options.approvalResolver`. The `@forumone/throughline-approvals` plugin attaches its resolver under that symbol automatically, so adding approvals to a config no longer requires re-wiring the publishing plugin's options. An explicit `options.approvalResolver` still takes precedence when you need to override.

## 0.2.0

### Minor Changes

- [`123d2ea`](https://github.com/forumone/throughline/commit/123d2ea0172d9495b9e2c8e8c6039e623f5fba66) Thanks [@briangraves](https://github.com/briangraves)! - Initial release. Policy-gated publishing server with a seven-step pipeline (exist, composition, accessibility, required-fields, embargo, approval, execute), five MCP tools (publish, unpublish, schedule_publish, get_publish_status, rollback), and a Payload `beforeChange` hook on every publishable collection that rejects direct `_status` writes from anywhere other than the pipeline's execute step. Built-in accessibility checks cover alt text, heading hierarchy, and link labels; clients add custom checks via the `accessibilityChecks` option.

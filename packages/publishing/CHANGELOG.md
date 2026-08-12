# @forumone/throughline-publishing

## 0.3.2

### Patch Changes

- 4eeb721: Fix published documents being uneditable: allow draft writes through the trust boundary.

  Editing an already-published document failed with `Direct writes to _status are not allowed` — from both the plugin's own Publish button and Payload's native Save Draft, which discarded the editor's work. Only first publishes worked, because an unmodified document skips the draft save.

  Payload sets `data._status = 'draft'` on every `draft: true` update _before_ `beforeChange` runs, whether or not the caller supplied it. By the time the hook saw the write, saving a draft of a published document was indistinguishable from unpublishing it: `data._status` was `'draft'` and `originalDoc._status` was `'published'` in both cases. A draft save writes a version and leaves the live document alone, so it should never have been blocked.

  The plugin now installs a `beforeOperation` hook that records the operation's own `draft` argument, which `beforeChange` reads to tell the two apart. That argument is visible identically on the Local API, REST and GraphQL, unlike `req.query.draft`, which is only populated on the REST path.

  A `draft: true` request that sets `_status: 'published'` is still blocked — Payload's own `isSavingDraft` excludes it, so it is a real publish and belongs in the pipeline. Genuine unpublishes and direct publishes are unchanged. Installing the status-write hook without the recorder fails closed.

- 4eeb721: Fix two defects reported against 0.3.0.

  **The `alt-text` check false-positived on Payload upload derivatives.** `walkForImages` descended into a populated upload's `sizes` map, and every generated size carries `filename` and `mimeType` but never `alt` — that lives on the parent document. Each configured `imageSize` therefore produced one false failure, and any page carrying a sized image could not be published. The walk now skips `sizes` on an object that is itself an image; alt text is checked once, on the parent. A parent with missing or empty alt still fails, at the parent's path, and a host with no `imageSizes` is unaffected.

  **A failed Inngest emission failed a publish that had already succeeded.** The event is sent after the document is written, so a transport failure (an invalid `INNGEST_EVENT_KEY`, say) returned 500 for a document that was published — and lost the audit record for it. Publish, unpublish, rollback and `schedule_publish` now report success and carry the emission failure as a `warnings` array on the result. The admin renders it as a warning toast on an otherwise successful publish.

  Also adds `disableAccessibilityChecks`, naming built-in checks to skip. `accessibilityChecks` only appends, so previously a built-in that misfired on a host's content shape blocked every publish until the plugin shipped a fix.

## 0.3.1

### Patch Changes

- fc5c236: Fix two defects reported against 0.3.0.

  **The `alt-text` check false-positived on Payload upload derivatives.** `walkForImages` descended into a populated upload's `sizes` map, and every generated size carries `filename` and `mimeType` but never `alt` — that lives on the parent document. Each configured `imageSize` therefore produced one false failure, and any page carrying a sized image could not be published. The walk now skips `sizes` on an object that is itself an image; alt text is checked once, on the parent. A parent with missing or empty alt still fails, at the parent's path, and a host with no `imageSizes` is unaffected.

  **A failed Inngest emission failed a publish that had already succeeded.** The event is sent after the document is written, so a transport failure (an invalid `INNGEST_EVENT_KEY`, say) returned 500 for a document that was published — and lost the audit record for it. Publish, unpublish, rollback and `schedule_publish` now report success and carry the emission failure as a `warnings` array on the result. The admin renders it as a warning toast on an otherwise successful publish.

  Also adds `disableAccessibilityChecks`, naming built-in checks to skip. `accessibilityChecks` only appends, so previously a built-in that misfired on a host's content shape blocked every publish until the plugin shipped a fix.

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

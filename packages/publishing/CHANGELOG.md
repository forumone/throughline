# @forumone/throughline-publishing

## 0.7.1

### Patch Changes

- Updated dependencies [9131065]
  - @forumone/throughline-core@0.6.0

## 0.7.0

### Minor Changes

- 1a4a441: Let every server's tools be served by Payload's own MCP plugin

  `createMcpToolCollector()` in core, and an `mcpTools` option on all six servers. The host hands the collector's array to `@payloadcms/plugin-mcp` at config time and each plugin fills it at `onInit` — which works because the plugin reads `mcp.tools` inside the handler it builds per request, so an array handed over empty is read populated.

  That ordering is the whole problem this solves: every tool in the suite is built at `onInit` because every one closes over `payload`, and `mcpPlugin` takes its tools as a config option.

  Omit `mcpTools` and nothing changes — each server keeps its own `/mcp` endpoint, which is what lets a host move one at a time rather than all six at once.

  Duplicate tool names are refused, naming both servers. Six servers each owning a `publish` was fine while each had its own endpoint; one server is one namespace, and an MCP client offered two tools under one name gets whichever registered last.

  **Also fixes a defect the integration test found.** `service.loadDocument` called `findByID` without `disableErrors`, so a missing document threw `NotFound` before the pipeline ran — which made the `exist` step's `not-found` branch unreachable from every caller, and turned "publish a document that does not exist" into a thrown error instead of the diagnostic the pipeline exists to return. The step's own tests passed it an empty document and so never noticed. `unpublish` now distinguishes a missing document from one that is merely already a draft.

### Patch Changes

- Updated dependencies [1a4a441]
  - @forumone/throughline-core@0.5.0

## 0.6.0

### Minor Changes

- 9f39ace: Enforce API-key scopes, which until now were only a label

  The API-keys collection has always had a required `scopes` field, the README has always told you to mint keys with `--scopes publishing.execute`, and the scheduled-publish factory documents that its key "must carry `publishing.execute` scope". Nothing read the field. Every key could do whatever its linked user could, whatever it said on the label.

  A tool may now declare `requiredScope`, and the handler holds callers to it: the tool is hidden from `tools/list` and refused on a direct call unless the key names that scope. Hidden as well as refused, because an agent shown a tool it will be turned away from will try it, fail, and report the tool as broken when what is narrow is the key.

  The consequential tools are annotated — `publish`, `unpublish`, `schedule_publish`, `rollback` (`publishing.execute`); `request_approval` (`approvals.request`); `respond_to_approval` (`approvals.decide`); the three form writers (`forms.manage`); `trigger_sync` and `test_integration` (`integrations.trigger`). Reads are left unscoped, which is the right default for a read.

  **This narrows existing keys.** A key minted with one scope could previously call every tool on every server and now cannot. That is the point, but it will change what an existing MCP client can do — check the scopes on your keys before upgrading. A key carrying no scopes at all passes nothing scoped: absent is read as none, not as everything.

### Patch Changes

- 75179c9: Respect document locks on publish, unpublish and schedule

  Payload locks a document while somebody has it open in the admin, and the Local API overrides that lock by default. Every write in this package took the default — so an agent publishing over MCP pushed a document live while an editor was part-way through revising it, and nothing anywhere said so. `schedule_publish` did the same, more quietly.

  All three now pass `overrideLock: false`. A lock blocks only when it is held by somebody else and has been touched within its duration (five minutes by default), so an editor publishing their own open document still passes, and an abandoned tab stops blocking on its own within a few minutes.

  A locked document comes back as a pipeline block — `code: 'document-locked'` — rather than a thrown error, so the admin and the MCP client both get an answer that says what to do about it: wait, or ask the person to finish.

- Updated dependencies [40839b5]
- Updated dependencies [9f39ace]
- Updated dependencies [f138b3d]
- Updated dependencies [6fac789]
  - @forumone/throughline-core@0.4.0
  - @forumone/throughline-plugin-contract@0.3.0

## 0.5.0

### Minor Changes

- 43c0636: Show a blocked publish on the fields that blocked it, and stop announcing the draft save

  Every publish diagnostic arrived as a toast in the corner, which left an editor reading `layout.7.image` and counting blocks. The pipeline's issues have always named their fields; they are now dispatched into form state, so the field carries the message and the collapsed block row containing it carries an error count. An issue with no field — an embargo, a missing approval — stays in the toast, which still lists everything.

  Only fields the form actually has are marked, and an issue that names something deeper (a populated relationship's image, a block index) marks the nearest field that owns it. Payload's reducer creates a field state entry for any path it is handed, so an invented path would become invented data on the next save.

  A field the collection itself refuses is now a failed step rather than a thrown error: `failedAt: 'execute'`, `code: 'field-validation-failed'`, with Payload's field paths as `issues`. The publishing write is the first step that enforces `required` — a draft write deliberately does not — so an empty required field inside a block is caught there and nowhere earlier. `publishDocument` and the `publish` MCP tool now return that as a result instead of throwing.

  The interim draft save the Publish button performs no longer shows its own success toast. It is a step inside publishing rather than something the editor asked for, and its notice used to land on top of the publish one. Payload's own Save Draft button is untouched.

## 0.4.0

### Minor Changes

- d20f909: Bind an approval to the document's content rather than to its `updatedAt`.

  `request_approval` stored `String(document['updatedAt'] ?? …)` as `targetVersion`,
  and publishing's approval step recomputed the same expression at publish time. So
  an approval was tied to a timestamp that moves on **every** save. An editor fixing
  a typo between an approver opening the request and clicking approve invalidated the
  approval — and the approver spent that time reading a version that no longer
  existed.

  Requiring re-approval after an edit is a defensible rule. Inheriting it from
  whichever timestamp field happened to be nearby is not, and it is why **autosave
  could not be turned on** anywhere the approvals plugin is installed: autosave moves
  `updatedAt` every couple of seconds of typing, so a pending approval would be
  invalidated continuously.

  Both sides now call `documentContentHash(document)`, new in
  `@forumone/throughline-core`. It hashes the document with the metadata that moves
  without the content moving stripped at every level — `id`, `createdAt`,
  `updatedAt`, `_status`, `__v`, `_id`, `globalType` — over keys in sorted order,
  since blocks come back out of JSONB in no promised order. Array order is preserved,
  because that is the order of the blocks on the page. `{ exclude }` adds
  app-specific bookkeeping fields to the strip list.

  The rule is now the one that was wanted all along: a save that changed nothing
  keeps a granted approval, a save that changed something invalidates it, and an edit
  that is reverted brings the approval back. That last one is why this is a content
  hash rather than a version id — a version id moves whether or not the content did.

  The two sides only agree because they load the document identically, with
  `payload.findByID({ collection, id, draft: true })` at the config's default depth.
  A populated relationship and a bare relationship id are different values and no
  normalising makes them one, so a caller hashing a document fetched at some other
  depth gets a hash that matches nothing. That is stated on the function.

  **Approvals pending at upgrade must be re-requested.** Their `targetVersion` holds
  an ISO timestamp; the publish step now computes a hash, so nothing matches and
  those documents report `approval-required` until a fresh request is granted. No
  migration is offered, because the old value cannot be converted — the content it
  was granted against is not recoverable from a timestamp. Grant a moment for
  in-flight requests to clear before upgrading, or expect approvers to be asked once
  more.

  Also exports `isDraftWrite` from `@forumone/throughline-publishing`. It is the
  predicate the plugin's own trust boundary uses to tell a "Save draft" apart from
  an unpublish, and it is unavailable to host code that needs the same answer: an
  `afterChange` hook cannot work it out, because Payload sets `data._status =
'draft'` on any `draft: true` update before the hooks run and `previousDoc` is the
  latest _version_ rather than the live document. With autosave on, a host hook that
  drops a cache or sends a notification fires every few seconds of typing unless it
  asks this first.

  Minor rather than patch on all three: `documentContentHash` and `isDraftWrite` are
  new public API, and the stored meaning of `targetVersion` changes.

### Patch Changes

- Updated dependencies [d20f909]
  - @forumone/throughline-core@0.3.0

## 0.3.4

### Patch Changes

- add60df: Stop overwriting `publishedAt` on every publish.

  `executeStep` wrote the current time into the collection's `publishedAtField` on
  every run, so re-publishing an edit re-dated the document. The field means "when
  this went live" — a listing sorts on it and a template prints it — so the visible
  effect was that editing a two-year-old article sent it to the top of its index
  under today's date, and an editor who typed the original date into the sidebar
  watched publishing replace it.

  The guard was already there and unused: the step computes `wasFirstPublish` for
  the `content/page.published` payload, where it is reported as `isFirstPublish`.
  It now also decides the write, so `publishedAt` is stamped on a first publish and
  left alone afterwards. A document that should genuinely be re-dated is re-dated
  by editing the field, which now survives.

  `previousPublishedAt` and `isFirstPublish` in the event are unchanged, so a
  subscriber that wants the publish time of _this_ publish still has it.

  Patch rather than minor: the fix restores what the field was documented to mean.
  Anything relying on it as a last-published timestamp was relying on the bug — and
  `updatedAt` is the field for that.

## 0.3.3

### Patch Changes

- de1d480: Fix two defects reported against 0.3.2.

  **A direct unpublish was allowed once a draft version existed.** `beforeChange` compared `data._status` against `originalDoc._status` and treated a match as a harmless no-op — but `originalDoc` is the _latest version_, not the live document. After any draft save of a published page, `originalDoc._status` is `'draft'` while the page is still live, so an unpublish matched the no-op branch and went through with no pipeline, no audit event and no revalidation. The hook now asks whether the write changes what the public sees, reading the live row when `originalDoc` cannot answer. Promoting a pending draft with a direct `_status: 'published'` write is blocked too — the live status never changes there, so no status comparison could have caught it. Ordinary edits of published documents are unaffected.

  **The publish button left the form showing pre-edit content.** After publishing, the button reset the form from `useDocumentInfo().data` — the document as it was when the edit view mounted — which replaced the editor's just-saved values with the pre-edit ones and read as though the publish had discarded them. The draft save already merges the server's response into form state, so the reset is removed rather than replaced.

  Also adds an integration suite that exercises the hooks inside a real Payload instance against a real database, covering the full matrix of draft saves, edits, publishes and unpublishes. Every defect in this hook so far came from unit tests encoding assumptions Payload does not hold.

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

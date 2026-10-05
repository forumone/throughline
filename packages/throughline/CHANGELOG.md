# @forumone/throughline

## 2.6.0

### Patch Changes

- Updated dependencies [b2ac71b]
  - @forumone/throughline-design-system@2.6.0

## 2.5.0

### Minor Changes

- b68bb9d: An agent can fill an image slot it has no image for (forumone-2026#845).

  - **Three new image values.** Wherever `save_draft`, `edit_blocks`, `create_draft`, `update_draft` or the block tools take an image, they also take `{ importUrl, alt }` (fetch a public image), `{ file: { base64, filename }, alt }` (upload a file the agent can read) or `{ placeholder: { alt, label } }` (a generated PLACEHOLDER image).
    - Each becomes a media document, created as the person, after every other check passes.
    - The result lists them under `imagesCreated`.
  - **`uploadUrl` in `get`.** It's the media collection's create screen, so the person can upload the image there and hand back its address. It's made absolute like `previewUrl`.
  - **`placeholderImages: { collection, field? }`** (content plugin, passed on by `throughline()`) flags placeholders with a checkbox. The publishing pipeline's new `placeholder-images` step refuses a page that still uses one, naming each place. The checkbox is a migration in the host.
  - **Prompts.** The authoring prompts tell the agent to offer upload, link or placeholder instead of leaving an image slot empty.

### Patch Changes

- @forumone/throughline-design-system@2.5.0

## 2.4.0

### Minor Changes

- c49a98b: A block with an empty required field no longer passes `check` or takes a page down (forumone-2026#840).

  - **Publishing:** the composition step reports a `required-field` issue for each required field inside a block that is empty, for example "Block 3 (Featured Work) › Item 2 › Image is required before this can be published."
    - `check`, `get_publish_status` and the admin's publish all see it before the write.
    - Before this, only Payload's write enforced `required`, and `check` called such a page ready.
    - The rule walks the block's Payload config. So a field the site adds counts, such as a form block's `source.form`. A field the site omits or hides doesn't. A required link counts too, because the contract says so even though a generated link enforces it with a validate.
  - **Render:** `RenderBlocks` no longer renders a component whose required image didn't arrive, whether the slot is empty in a draft or the image no longer resolves.
    - The component would read `item.image.src` from nothing and throw, and one card took Live Preview down to the error page.
    - The new `onIncompleteBlock` decides what renders instead. It defaults to nothing.
    - `missingRequiredImages` is exported for a host to ask the same question.

### Patch Changes

- e48f0cd: The `previewUrl` and `adminUrl` that MCP tools return are absolute, so a person can open them from a chat in another app (forumone-2026#840). They were paths whenever the site left Payload's `serverURL` unset. They are now made absolute against `serverURL` when it is set, and otherwise against the origin the MCP request arrived at. A document's own fields are left as they are.
- e48f0cd: `design_guide` for a component also returns `siteFields`: the fields a site adds to that block beyond the component's contract, described the way `get` describes a content type, with `findWith` saying which `find` kind looks up a value. A form block's `source.form` was invisible to an agent, so it added the block and left the form empty (forumone-2026#840).
- Updated dependencies [c49a98b]
  - @forumone/throughline-design-system@2.4.0

## 2.3.0

### Minor Changes

- f215fe2: `@forumone/throughline/mcp-oauth`: people connect Claude, Claude Code or ChatGPT to `/api/mcp` by signing in, not by being handed an API key (forumone-2026#838).

  - `mcpOAuth()` adds an OAuth 2.1 authorization server for `/api/mcp`, with discovery, client ID metadata documents and dynamic registration, PKCE S256, `iss` in the response, rotating refresh tokens and reuse detection, plus revocation. Apps are recognised by an allowlist of their redirect URIs. Its `overrideAuth` goes to `mcpPlugin`.
  - An admin-only **MCP access** global decides which apps may connect and which tools administrators and everyone else are offered. Connections and their tools are re-read on every request, so a policy change, a revoked connection or a lost role takes effect at the next call.
  - **Connect MCP** (`/admin/connect-mcp`) shows the address, a button for Claude, the Claude Code command and the ChatGPT steps, and lists the person's connected apps with Disconnect. The consent screen names the app by the callback it matched, not by what it calls itself.
  - API keys keep working beside it. By default the person behind a key is now held to the same `eligible` rule on every request.
  - `AUDIT_ACTIONS` gains `mcp.connected` and `mcp.disconnected`. **This is an enum migration in the host.** `ReportsNav` takes an optional `label`.

### Patch Changes

- @forumone/throughline-design-system@2.3.0

## 2.2.0

### Minor Changes

- 623d42c: Messages an editor can read now make sense to an editor: they say what happened in the editor's terms, what to do next, and to "tell a site administrator" when only somebody else can fix it. (forumone-2026#805)

  - **The publish-blocked notification lists issues where the editor finds them.** It no longer starts "Blocked at: composition", lists `layout[2]: …` or `(root): …`, or prefixes "Suggestion:". Every pipeline issue gains `where`, its `field` as the collection's labels say it — `Block 3 (Image Hero) › Image`, `SEO › Title` — computed from the field config for built-in and custom checks alike, and the admin prints it before the message. An issue marked on an ancestor field (three blocks' problems on `layout`) says which block it is about.
  - **Components are named by their block's label,** not their contract name. The composition validator takes a `label` function; the publish step passes each block's `labels.singular`, and the `validate_composition` MCP tool keeps contract names. `componentDisplayName` (`ImageHero` → `Image Hero`) is exported from `@forumone/throughline-design-system/contract`.
  - **Every step's wording is rewritten** — not found, already published, composition, accessibility, required fields, embargo, expiry, approval, document locked (now naming who holds the lock), field validation — as are the individual checks (alt text, link text, SEO title and description, slug) and the composition rules (unknown component, unknown variant, forbidden neighbours, maximum per page, placement, recipes, empty block). Tests and hosts asserting the old strings need updating; `code`, `rule`, `failedAt` and `field` are unchanged.
  - **Setup problems no editor can fix** (`components-server-missing`, `approval-resolver-missing`, a collection not registered as publishable) say to tell a site administrator. The setup instruction moves to a new `detail` field, which is logged and still returned to MCP callers.
  - **Dates read like dates.** An embargo's end or an expiry is written `Tue 6 Oct 2026, 1:00 pm UTC` in the zone set by the new `publishing.timeZone` option (IANA, default `UTC`), and returned as `when: { at, text }`; the admin rewrites it into each editor's own zone.
  - **Connection and server problems** in the admin say whether anything changed and what to do. A malformed request to the publishing endpoints reads as an unexpected problem, with the specifics in `detail`.
  - **Unpublish, schedule and cancel** results carry a `code` (`not-found`, `not-published`, `not-scheduled`, `invalid-time`, `time-in-past`), and cancelling a schedule when nothing was scheduled no longer reports success. The trust boundary's refusal of a direct `_status` write (bulk publish, restore as published) tells the editor to use the document's own Publish or Unpublish button.
  - **A failed event after a publish** warns in terms of what the editor will see; which event and why go to the log.
  - **Composition warnings are no longer dropped.** A component missing the sibling its contract `requiredSiblings` names now reaches the publish result's `warnings`.
  - **The one-hero check fires.** `heading-hierarchy` matched only a block typed `hero`, which no design system has, so it never ran. It now counts blocks whose contract `category` is `hero` (custom checks receive a third `context` argument with the components), falling back to the old match without the components plugin.
  - **The in-use refusal reaches the editor.** It was a non-public 500, which Payload replaces with "Something went wrong."; it is now a public 503. Its list names each document's collection by its singular label and the place by its field labels: `• Case Study › Acme rebrand (Layout › Block 2 (Card Grid) › Card 1 › Image)`. References carry `dataPath` and `where`.
  - **`refuseSlugHeldInTrash`, `refuseMimeTypesOutside` and `refuseStorageKeyMismatch`** pass `req.t` to `ValidationError`, so a site's translation of "The following field is invalid:" applies. The upload-path refusals are rewritten, and the two storage paths are logged instead of shown.
  - **Integrations:** an unknown type or invalid settings is now an `APIError` 400, which Payload shows, instead of an `Error` it replaced with "Something went wrong.". `lastError` opens with a one-line summary anybody can read before the integration's own detail.
  - **Approval links:** an invalid, expired or withdrawn link says so in plain words and what to do; why a token failed goes to the log.
  - **Generated blocks:** the "needed once anything else here is filled in" message names fields by their label ("Video URL"), not their name (`src`).

- 623d42c: Error toasts stay until they are read, and a failed save takes the editor to the field that is wrong. (forumone-2026#805)

  - **Go to the first error.** After a Save, Publish or Schedule that fails — never after an autosave — the admin opens the tab or collapsed block or array row the first invalid field is in, scrolls it into view below the sticky header (a jump instead of a smooth scroll under `prefers-reduced-motion`) and focuses its input. The publishing plugin registers it as `FirstErrorProvider` in `admin.components.providers`; `publishing.goToFirstError: false` leaves it out. `goToFirstError()` is exported from `@forumone/throughline/client` for a host's own controls.
  - **Run `payload generate:importmap` after upgrading.** A provider missing from the import map renders nothing, and since a provider wraps the whole admin, the admin would render blank.
  - **Errors stay until closed, and replace rather than stack.** The Publish, Unpublish, Schedule and Sync controls' error toasts last until dismissed and carry a stable id per document, so a second click replaces the first toast. A blocked publish or schedule with marked fields has a **Show me** action. A success clears the error.
  - **Cancelling a schedule when nothing was scheduled** says "There was nothing scheduled." rather than "Schedule cancelled". The Schedule control's other text is rewritten too, and its times use the same `Tue 6 Oct 2026, 9:00 am EDT` form as every other date.

- 332baf9: Publishing refuses a page whose internal links go to a draft, trashed or deleted document (forumone-2026#756). A new pipeline step, `link-targets`, runs after `required-fields` and looks up every link's target. A deleted target, a trashed one, or an unpublished one in a collection with drafts blocks the publish (`code: 'link-targets'`). Each issue names the block or field and the target's title, and its `field` is the link's own path, so the admin marks it. An unpublished target with a scheduled publish time is a warning, not a block.

  **This is a new blocking step, and it's on by default.** After upgrading, a page that already links to a draft or trashed page can't be published until the link is fixed. `get_publish_status` and `check` report it like any other blocker. To switch it off, set `publishing: { linkTargets: { enabled: false } }`.

  A link is either an internal link in Lexical rich text, or a relationship field marked with `custom: { throughlineLinkTarget: true }`. The design-system generator's `linkField` now marks its `reference`, so every generated link is covered without changes. To cover a hand-written link field, wrap it in `markLinkTarget` from `@forumone/throughline/publishing`. A marked reference whose sibling `mode` isn't `internal` is ignored, and `markLinkTarget(field, { when })` takes a different rule. The structural walk behind `referencesIn` is now `walkDocument`, exported from `/media` along with `linkTargetsIn`.

- a9d4873: The `link-targets` publish step now checks links inside composed sections (forumone-2026#756). A composed section stores its content as JSON, one value per field its recipe declares, so before this change a landing page whose composed-section link went to a draft, trashed or deleted page published without a warning. With `publishing.recipes` configured, the step reads every recipe the document uses in one query. It then walks each block's content by the recipe's `contract.content.fields`: a `link` (`{ mode, reference: { relationTo, value } }`, with the same `mode` rule as a generated link), internal links in a `richtext` field, and both of those inside a `group` or `array`. The verdicts and messages are the same as for any other link. The issue's `field` is the content field's path (`layout[2].content`), and its `where` is the block (`Block 3 (Composed section)`). `composedRecipeIds` and the `composed` option of `linkTargetsIn` are exported from `/media`.

  A new subpath, `@forumone/throughline/links`, exports `markLinkTarget`, `LINK_TARGET_KEY` and `linkTargetMarker`. It imports nothing at run time, so a link-field helper that a `'use client'` module also imports can mark its reference. `/publishing` still exports `markLinkTarget` and `LINK_TARGET_KEY`.

  `/integrations` now exports `LAST_ERROR_SUMMARY`, `lastErrorText`, `lastErrorDetail` and `statusUpdateData`, so a site can test what an integration's `lastError` will say.

### Patch Changes

- Updated dependencies [623d42c]
- Updated dependencies [332baf9]
  - @forumone/throughline-design-system@2.2.0

## 2.1.0

### Minor Changes

- dddeab8: Content written over MCP can no longer be lost silently, and an empty block no longer publishes. (forumone-2026#832, found by the #830 eval)

  - **Values are checked for their shape at every depth.** A link sent as a string, `"/contact"`, used to be saved as an empty `{ mode: "internal" }` and the write reported success. Now `save_draft` and `edit_blocks` refuse a value in the wrong shape and say which shape the field takes. That applies to a group or link, an array, a blocks field, a row and a block.
  - **Rich text below the top level is converted or refused.** Markdown in an accordion item used to be stored as an object that renders nothing. The new `content.blockRichText` option converts it; without that option, only an editor state is accepted.
  - **`get` and `design_guide` say how values are written.** Both return `valueShapes`, and each link field `get` describes carries its `shape`.
  - **An empty block does not publish.** The composition step adds an `empty-block` rule: a block whose content fields are all empty. It doesn't apply to blocks with no content fields or blocks that fetch their own data.
  - **A pending approval is reported.** `check` and `publish` name the approval request that's already pending, and `publish` won't file a second one.
  - **`hasUnpublishedChanges` compares content, not timestamps.** A draft identical to what's live, for example after a rollback, no longer reports unpublished changes.
  - **`request_approval` uses the collection's own preview link** when the collection has one, the same link every other tool returns.

### Patch Changes

- @forumone/throughline-design-system@2.1.0

## 2.0.0

### Major Changes

- a30f5dd: **`/api/mcp` serves eight authoring tools instead of every module's tools.** (throughline#302, forumone-2026#830)

  A full install used to serve 48 tools, about 9k tokens. That's more than a model chooses between well, and more than some clients allow: Cursor stops at 40. The server is now shaped by what it's for, which is drafting and publishing content from a client such as Claude Desktop:

  - `find`, `get`, `save_draft`, `edit_blocks`, `check`, `publish`, `design_guide` and `compose_section`.
  - Each is a thin wrapper. The modules still build their own tools, into a collector `plugin-mcp` never sees, and the eight call those tools' handlers with the caller's context. Access, audit and every check are unchanged.
  - **`publish` takes an `action`:** `now`, `schedule`, `unpublish`, `rollback` or `request_approval`.
    - Taking something live needs an admin or an editor. Set `mcp.canPublish` to use a different rule.
    - A document that needs approval cannot go live until approval is granted. `now` says so, names the approver groups, and files the request itself when given `approval`.
  - **`edit_blocks` applies a list of block operations** (insert, update, move, remove) to one field, and checks and saves them together.
  - **The operations tools stay, under their own names, for admins only.** These are the audit queries, integrations, job failures, the approvals queue, the calendar, health and the reference checks. `mcp: { ops: false }` turns them off.
  - **`suite.mcpPrompts` adds three MCP prompts:** `draft_post`, `build_landing_page` and `get_ready_to_publish`. Pass them to `mcpPlugin({ mcp: { tools: suite.mcpTools, prompts: suite.mcpPrompts } })`.

  **Breaking:** the module tools are no longer served by name. The host needs:

  - a migration, because `plugin-mcp` drops the old per-tool checkbox columns on `payload-mcp-api-keys` and adds the new ones;
  - every key set up again;
  - its key defaults updated to the new tool names.

  Runtime messages now name the new tools: `get`, `check` and `publish`. The module tool factories are still exported.

### Patch Changes

- a30f5dd: `rollback` restores the version as a draft, as its description promises. Before, rolling back wrote the version's own `_status` without saying it came from the publishing server, so on a site that blocks direct status writes every rollback was refused.
  - @forumone/throughline-design-system@2.0.0

## 1.9.1

### Patch Changes

- d7c2c22: `trigger_sync`'s description now says what the tool does: it runs a real sync, the same as the admin's "Sync now" button. It used to say the tool "sends a test payload", which could lead an agent to start a live sync while thinking it was only checking connectivity. It now points to `test_integration` for that.
  - @forumone/throughline-design-system@1.9.1

## 1.9.0

### Minor Changes

- efc1cc4: `get_publish_status` reports every preflight blocker at once, as `wouldPublish.blockers`, and the draft's `previewUrl`.

  It used to stop at the first failing step, so a draft with a composition problem and a missing required field took two calls to learn about both. Once `exist` passes, each later step now runs and every failure is kept, in pipeline order. The first blocker still fills `blockedAt`, `code`, `reason`, `suggestion` and `issues` exactly as before. `publish` and `schedule_publish` still stop at the first failure.

  `previewUrl` is the collection's own `admin.preview`, made absolute against `serverURL`, which is the link `create_draft` and `update_draft` already return. The shared helper moves to `utils/preview-url.ts`, and `content/tools` re-exports it. The service's `PublishStatusOutcome` gains `blockers` and `previewUrl`. (forumone-2026#827)

### Patch Changes

- @forumone/throughline-design-system@1.9.0

## 1.8.0

### Minor Changes

- 204009a: The publish gate for composed sections. The new `publishing.recipes` option names the block that holds a recipe and the collection recipes live in. With it, the composition step checks that each such block's recipe exists, is approved, still passes `lintRecipe` against the current manifest, and has its required content filled, instead of calling the block an unknown component. The components plugin now also attaches its loaded manifest for this. The composition validator also checks placement: a component placed only `inline` can't be a block on a page by itself.
- 5b5ee85: Adds the recipe MCP tools to the components plugin (`get_recipe_vocabulary`, `validate_recipe`, and `save_recipe`, which writes drafts only), turned on with the new `throughline({ recipes: { blockType, collection } })`. The same setting configures the publish gate and lets `validate_composition` and the content write tools treat that block as a composed section instead of an unknown component.

  **Upgrading: a migration.** The key collection gains three checkbox columns. Run `migrate:create` and apply it before deploying.

### Patch Changes

- @forumone/throughline-design-system@1.8.0

## 1.7.0

### Patch Changes

- Updated dependencies [e473c47]
  - @forumone/throughline-design-system@1.7.0

## 1.6.0

### Patch Changes

- Updated dependencies [d8178f0]
  - @forumone/throughline-design-system@1.6.0

## 1.5.0

### Minor Changes

- 4218ae9: Lets the content tools write a rich-text field as `{ markdown }` or `{ html }`. Each collection's `richText` option maps a field to a site converter, which returns an editor state or refuses with what would be lost, and nothing is saved on a refusal. `describe_content_type` says what each rich-text field accepts. A field without a converter still takes only an editor state. No migration.

### Patch Changes

- @forumone/throughline-design-system@1.5.0

## 1.4.0

### Minor Changes

- a7a9a8c: Adds `insert_block`, `update_block`, `move_block` and `remove_block` to the content tools. They change one block of a draft's blocks field, either `layout` or a field inside a group such as a case study's `approach.blocks`, without resending the layout. A new or changed block is checked against the blocks the field offers and against its own field validation, which a draft save would otherwise skip. The field is then checked against the composition rules before saving, with the same lock check and audit record as `update_draft`.

  **Upgrading: a migration.** The key collection gains four checkbox columns. Run `migrate:create` and apply it before deploying.

- 7f42a5d: Adds `create_draft` and `update_draft` to the content tools. Both write drafts only and refuse `_status`, publishing dates, the approval policy and any field off the site's allow-list. They refuse a document someone has open in the admin, naming the person (even when it's the key's own person, whose tab would autosave over the change). They also refuse a block the field doesn't offer, a layout that breaks the composition rules, and a slug that's taken, including one held in the trash. Each write is recorded in the audit log with the caller's `_meta`.

  **Upgrading: a migration.** The key collection gains two checkbox columns, one per new tool. Run `migrate:create` and apply it before deploying.

### Patch Changes

- @forumone/throughline-design-system@1.4.0

## 1.3.0

### Minor Changes

- 43a7b6d: Adds `@forumone/throughline/content` and a `content:` option on `throughline()`, with the MCP tools an agent uses to read before it writes a draft: `describe_content_type`, `find_documents`, `find_related` and `get_document`. Each call runs as the person behind the API key. Field types, limits and a blocks field's allowed blocks come from the live config. Draft-writing tools follow in a later release.

  **Upgrading: a migration.** The audit log's `mcpServer` gains `content`, a new value on `enum_audit_events_mcp_server`. A site that turns the tools on also gets four new checkbox columns on `payload-mcp-api-keys`. Run `migrate:create` and apply it before deploying.

### Patch Changes

- @forumone/throughline-design-system@1.3.0

## 1.2.0

### Minor Changes

- 17f8d7c: `mcpApiKeyAccess` takes an optional `holder` rule. Given one, an admin can choose who a new MCP key belongs to; nobody can change it afterwards; and a key for someone the rule refuses is not saved, with the rule's reason. Without it, nothing changes: a key belongs to whoever created it.

### Patch Changes

- @forumone/throughline-design-system@1.2.0

## 1.1.0

### Minor Changes

- c897829: Every tool the suite serves records a `system.error` when it throws. Editorial (`find_content_needing_attention`, `get_content_calendar`, `list_my_work`, `search_content`), references (`find_references`, `can_delete`), `check_slug` and `list_job_failures` were added to the MCP collector without an audit writer, so a crash in them reached the log and nowhere else. They now record one, under four new `mcp_server` values: `editorial`, `references`, `fields`, `observability`.

  **Upgrading: a migration.** The audit collection's `mcpServer` select gains four options, which on Postgres is four values on `enum_audit_events_mcp_server`. Run `migrate:create` (with `BLOB_READ_WRITE_TOKEN` set if you use the storage plugin) and apply it before deploying; nothing else changes. A plugin registered by hand without `auditPlugin` still works, and only logs a crash.

### Patch Changes

- 3406ccb: Approvals on Postgres, and approvals when an event cannot be sent:

  - **Confirming a decision from an approval email works on Postgres.** The action endpoint wrote the token's approver id as a string into `decidedBy`, a relationship to a users collection whose ids are numbers there, so every emailed decision failed on Confirm. It now writes the id in the users collection's type, as `request_approval` and `respond_to_approval` do since 1.0.1.
  - **A stored request or a recorded decision is reported as one when its event cannot be sent.** `request_approval`, `respond_to_approval` and the email action endpoint wrote first and then threw if `approval/requested`, `approval/decided` or `approval/discussed` failed to send, reporting an action that had landed as failed. The tools now return it with a `warnings` entry, and the endpoint shows the approver their confirmation and logs the warning — the same rule publishing follows. `sendEventSafely` moved to a shared module for it.

- 8212772: `throughline-payload` fails a Payload CLI run that exits 0 without finishing.

  Intermittently the Payload CLI's config `import()` never settles, and node exits
  by itself with status 0 having printed nothing and done nothing
  (payloadcms/payload#17757). A `migrate` that does that reports success over an
  unmigrated database. Every Payload command that completes calls `process.exit`,
  so the runner now preloads a guard that turns an exit nobody asked for into
  status 70, with a message saying to run it again.
  - @forumone/throughline-design-system@1.1.0

## 1.0.1

### Patch Changes

- bb02ed8: `request_approval` and `respond_to_approval` work on Postgres. An MCP caller's id arrives as a string, and they wrote it as one into `requestedBy` and `decidedBy`, relationships to a users collection whose ids are serial numbers there — so Payload refused it ("The following field is invalid: Requested By") and no approval could be requested over MCP. They now write the id in the users collection's own id type (`customIDType`, or the adapter's default), and `list_my_requests` queries by it.
  - @forumone/throughline-design-system@1.0.1

## 1.0.0

### Major Changes

- dcf84fc: `resend`, `@react-email/components` and `@react-email/render` are optional peers rather than dependencies, and `inngest` is an optional peer. `payload` is the only required one. Each optional peer is loaded only by the subpath that uses it, and the root loads none: the approval emails import their templates when they send, so registering the suite with `throughline()` no longer loads React or React Email. A missing optional peer fails when its feature runs, with an error naming the package to install.
- e7d34fa: Smaller gaps closed before 1.0:

  - `Integration.createFunctions` is optional. `throughline()` runs `createJobs` and never called it.
  - `auditQuery.readAccess` now applies: it takes the tool's context, `(ctx) => boolean`, and replaces the admin/editor rule for the five audit tools. It was declared with a `PayloadRequest` and read by nothing.
  - `job-failures` takes an `admin` sidebar group like every other Throughline collection, and gets the suite's from `throughline()`.
  - An accessibility issue of severity `warning` reaches the publish result's `warnings` instead of being dropped.
  - The webhook integration no longer subscribes to `form/submission.received`, which nothing sends since forms left the suite; the stored filter option stays. Stale text naming forms, the "Approvals Server" and 0.x paths is corrected.

- 673ff70: `throughline()`: one call for the whole suite (`docs/spec/1.0-throughline-call.md`). It returns `{ plugin, mcpTools, jobs }`: one Payload plugin that registers every enabled Throughline plugin in order, the tool array for `mcpPlugin`, and every job the options call for. Audit, job failures and `check_slug` are always on; every other plugin is on when its key is present. Shared values are given once: `approvals.collectionSlug` reaches the collection, the emails and the expiry job, and `collections` reaches publishing, "Your work" and scheduled publishing. Its defaults are what every site wrote by hand: scheduled publishes go through the publishing pipeline (`publishScheduledThroughPipeline`), approval links are signed with approvals' secret, and a failing healthcheck is recorded in `job-failures`. On Payload Jobs it registers its jobs itself. It refuses an integration with no `createJobs`.

  **Internal now:** `getPluginRegistry`, `resolveAdminGroup`, `DEFAULT_ADMIN_GROUP`, `PluginRegistry*`, `createMcpToolCollector` and the collector's option types, `toPayloadMcpTool(s)`, `getEmailFunctions`, `getIntegrationRegistry` and `getIntegrationContext`. Use `throughline()`. `McpToolCollector` and `PayloadMcpTool` stay exported as types.

  `HealthcheckOptions.onFailure` receives `{ payload }` as a second argument, and `createHealthcheckFailureHandler()` made without a `payload` records on the run's own.

- fb0b908: Jobs move in from `@forumone/throughline-workflows`, split by owner, by `docs/spec/1.0-exports.md`:

  - `defineJob`, the job types, `jobPayload`, `eventSenderFor`, `failureOptions` and the two failure handlers are on `@forumone/throughline/jobs`.
  - `inngestJobs` is on `/jobs/inngest`, beside the Inngest client; `payloadJobs` is on `/jobs/payload`.
  - `revalidateOnPublishJob`, `publishAtScheduledTimeJob`, `executeScheduledPublishesJob` and `createTagRevalidationHooks` are on `/publishing`; `expireStaleApprovalsJob` on `/approvals`; `auditEventEchoJob` on `/audit`; `healthcheckJob` and its checks on `/integrations`.
  - `createCacheTags` is on `/cache-tags`, which still imports nothing.

  **Removed:** the six Inngest-shaped factories, `createRevalidateOnPublishFunction`, `createPublishAtScheduledTimeFunction`, `createExecuteScheduledPublishesFunction`, `createExpireStaleApprovalsFunction`, `createAuditEventEchoFunction` and `createHealthcheckFunction`. Each was `inngestJobs(inngest).toFunction(<job>(options))`; write that instead, or better, give the adapter `onFailure` and `payload` once and pass the jobs to `jobs.functions([...])`. Function ids are unchanged. `BaseWorkflowOptions` and `AuditEventEchoOptions` no longer take an `inngest`.

- cb29249: `@forumone/throughline`: the 1.0 package, starting from `@forumone/throughline-core` and `@forumone/throughline-plugin-contract`.

  The root holds what is shared: environment checks, access helpers, the logger, utilities, the plugin and MCP tool types, and the MCP collector until `throughline()` wires it. Everything else is on a subpath: `/audit`, `/fields`, `/jobs`, `/jobs/inngest`, `/media` (now including reference tracking), `/observability`, `/testing`, `/client` and `/rsc`. The `throughline-payload` bin is unchanged.

  Moving from 0.x, by `docs/spec/1.0-exports.md`:

  - core's root no longer re-exports audit, events, references or observability; import them from `/audit`, `/jobs` and `/jobs/inngest`, `/media` and `/observability`.
  - `/events` is now `/jobs` (the event taxonomy) and `/jobs/inngest` (the Inngest client and Vercel environment pinning). Augment `CoreEvents` on `@forumone/throughline/jobs`.
  - `/references` is part of `/media`; `/env` and `/mcp` are part of the root; `/auth` is gone.
  - plugin-contract's types are on the root. Its separate `McpMeta` interface is gone; the root's `McpMeta` is the one.
  - Admin component paths are `@forumone/throughline/client#…` and `@forumone/throughline/rsc#UsedOnPanel`, so a site's `importMap.js` changes.

- 3b467f0: The last five 0.x server packages move in, by `docs/spec/1.0-exports.md`:

  - `@forumone/throughline-audit` joins core's audit writer on `@forumone/throughline/audit`. `DEFAULT_AUDIT_COLLECTION_SLUG` is gone; use `DEFAULT_AUDIT_SLUG`, the same value.
  - `@forumone/throughline-approvals` is `/approvals`. `APPROVALS_RESOLVER_SYMBOL` is internal.
  - `@forumone/throughline-components` is `/components`.
  - `@forumone/throughline-integrations` is `/integrations`; its `/client` (`SyncButton` and helpers) joins `@forumone/throughline/client`.
  - `@forumone/throughline-email` and its `/templates` are `/email`. `DEFAULT_APPROVALS_COLLECTION_SLUG` is gone; use `DEFAULT_APPROVALS_SLUG` from `/approvals`, the same value. `validateOptions` is internal.

  **Removed:** `createNotifyApprovalRequestFunction`, `createNotifyApprovalDecisionFunction` and `createNotifyApprovalExpiredFunction`. `emailPlugin` builds the same three Inngest functions itself, so `getEmailFunctions` and the function ids are unchanged; run `notify…Job` through an adapter to build one by hand.

  Admin component paths follow: `@forumone/throughline/client#SyncButton`. Plugin ids in the registry are `@forumone/throughline/<subpath>`, with the audit query plugin at `/audit-query`.

- ea3754f: Publishing moves in from `@forumone/throughline-publishing`, by `docs/spec/1.0-exports.md`:

  - `@forumone/throughline-publishing` and its `/checks` are `@forumone/throughline/publishing`.
  - `/editorial` is `@forumone/throughline/editorial`.
  - `/client` and `/rsc` are `@forumone/throughline/client` and `/rsc`, beside core's admin components.

  Admin component paths follow, so a site's `importMap.js` changes: `@forumone/throughline/client#PublishButton`, `#UnpublishButton`, `#SchedulePublishField`, `#CommandPalette` and `#ReportsNav`, and `@forumone/throughline/rsc#ContentHealthView`, `#ContentCalendarView` and `#YourWorkDashboard`. `next` and `@payloadcms/next` are optional peers, used only by those components.

- 6c1409a: The trust boundary now covers every write that changes what the public sees. A create with `_status: 'published'` is refused (create a draft, then publish), and so is a non-draft save that changes a live document (save a draft, then publish). Before, both went live with no pipeline, approval or audit row, so "requires approval" held only for a page's first publish. Data a system derives from a live page and writes back to it, such as an audio URL, passes with `context: DERIVED_WRITE_CONTEXT` from `/publishing`, which can never change `_status`, create, or promote a draft.

### Minor Changes

- 2e49ee7: `throughline migrate-imports [paths…] [--dry-run]`, a new bin: rewrites every 0.x `@forumone/throughline-*` import to its 1.0 home, by `docs/spec/1.0-exports.md`. It splits an import by where each name went, keeps `type` and aliases, rewrites admin component paths (`importMap.js` included), and points mocks, dynamic imports and module augmentation at the 1.0 counterpart for you to check. Names 1.0 removed or made internal are left in place and listed with what to use instead, as are the `package.json` dependencies to swap, and it exits 1 while anything is left. Run on forumone-2026, it rewrites 163 files and leaves the five imports `throughline()` replaces.

### Patch Changes

- 825f4e9: `@forumone/throughline-design-system`: the 1.0 design-system package, from `@forumone/throughline-design-contract` and `@forumone/throughline-design-system-payload`, by `docs/spec/1.0-exports.md`. It is published for the first time: design-system-payload was private and shipped TypeScript source, and this package builds to `dist`.

  - `@forumone/throughline-design-contract` is `/contract`, and its `/lint` is `/lint`.
  - design-system-payload's `/generate`, `/render`, `/client` and `/testing` keep their names. Its root (`fieldOverride` and the override types) is part of `/generate`.
  - The `check-block-props` bin is unchanged, and runs the built CLI.
  - Admin component paths are `@forumone/throughline-design-system/client#BlockSummary`, `#BlockGuidance` and `#RowSummary`, so a site's `importMap.js` changes.
  - `/contract` and `/lint` need no peers. `payload`, `react`, `@payloadcms/ui`, `typescript` (which `/generate` uses to read component source) and `vitest` (for `/testing`) are optional peers.

  `@forumone/throughline/components` now reads manifests through `@forumone/throughline-design-system/contract`.

- Updated dependencies [825f4e9]
  - @forumone/throughline-design-system@1.0.0

## 1.0.0-next.2

### Major Changes

- dcf84fc: `resend`, `@react-email/components` and `@react-email/render` are optional peers rather than dependencies, and `inngest` is an optional peer. `payload` is the only required one. Each optional peer is loaded only by the subpath that uses it, and the root loads none: the approval emails import their templates when they send, so registering the suite with `throughline()` no longer loads React or React Email. A missing optional peer fails when its feature runs, with an error naming the package to install.
- e7d34fa: Smaller gaps closed before 1.0:

  - `Integration.createFunctions` is optional. `throughline()` runs `createJobs` and never called it.
  - `auditQuery.readAccess` now applies: it takes the tool's context, `(ctx) => boolean`, and replaces the admin/editor rule for the five audit tools. It was declared with a `PayloadRequest` and read by nothing.
  - `job-failures` takes an `admin` sidebar group like every other Throughline collection, and gets the suite's from `throughline()`.
  - An accessibility issue of severity `warning` reaches the publish result's `warnings` instead of being dropped.
  - The webhook integration no longer subscribes to `form/submission.received`, which nothing sends since forms left the suite; the stored filter option stays. Stale text naming forms, the "Approvals Server" and 0.x paths is corrected.

- 673ff70: `throughline()`: one call for the whole suite (`docs/spec/1.0-throughline-call.md`). It returns `{ plugin, mcpTools, jobs }`: one Payload plugin that registers every enabled Throughline plugin in order, the tool array for `mcpPlugin`, and every job the options call for. Audit, job failures and `check_slug` are always on; every other plugin is on when its key is present. Shared values are given once: `approvals.collectionSlug` reaches the collection, the emails and the expiry job, and `collections` reaches publishing, "Your work" and scheduled publishing. Its defaults are what every site wrote by hand: scheduled publishes go through the publishing pipeline (`publishScheduledThroughPipeline`), approval links are signed with approvals' secret, and a failing healthcheck is recorded in `job-failures`. On Payload Jobs it registers its jobs itself. It refuses an integration with no `createJobs`.

  **Internal now:** `getPluginRegistry`, `resolveAdminGroup`, `DEFAULT_ADMIN_GROUP`, `PluginRegistry*`, `createMcpToolCollector` and the collector's option types, `toPayloadMcpTool(s)`, `getEmailFunctions`, `getIntegrationRegistry` and `getIntegrationContext`. Use `throughline()`. `McpToolCollector` and `PayloadMcpTool` stay exported as types.

  `HealthcheckOptions.onFailure` receives `{ payload }` as a second argument, and `createHealthcheckFailureHandler()` made without a `payload` records on the run's own.

- 6c1409a: The trust boundary now covers every write that changes what the public sees. A create with `_status: 'published'` is refused (create a draft, then publish), and so is a non-draft save that changes a live document (save a draft, then publish). Before, both went live with no pipeline, approval or audit row, so "requires approval" held only for a page's first publish. Data a system derives from a live page and writes back to it, such as an audio URL, passes with `context: DERIVED_WRITE_CONTEXT` from `/publishing`, which can never change `_status`, create, or promote a draft.

### Minor Changes

- 2e49ee7: `throughline migrate-imports [paths…] [--dry-run]`, a new bin: rewrites every 0.x `@forumone/throughline-*` import to its 1.0 home, by `docs/spec/1.0-exports.md`. It splits an import by where each name went, keeps `type` and aliases, rewrites admin component paths (`importMap.js` included), and points mocks, dynamic imports and module augmentation at the 1.0 counterpart for you to check. Names 1.0 removed or made internal are left in place and listed with what to use instead, as are the `package.json` dependencies to swap, and it exits 1 while anything is left. Run on forumone-2026, it rewrites 163 files and leaves the five imports `throughline()` replaces.

### Patch Changes

- @forumone/throughline-design-system@1.0.0-next.2

## 1.0.0-next.1

### Patch Changes

- 825f4e9: `@forumone/throughline-design-system`: the 1.0 design-system package, from `@forumone/throughline-design-contract` and `@forumone/throughline-design-system-payload`, by `docs/spec/1.0-exports.md`. It is published for the first time: design-system-payload was private and shipped TypeScript source, and this package builds to `dist`.

  - `@forumone/throughline-design-contract` is `/contract`, and its `/lint` is `/lint`.
  - design-system-payload's `/generate`, `/render`, `/client` and `/testing` keep their names. Its root (`fieldOverride` and the override types) is part of `/generate`.
  - The `check-block-props` bin is unchanged, and runs the built CLI.
  - Admin component paths are `@forumone/throughline-design-system/client#BlockSummary`, `#BlockGuidance` and `#RowSummary`, so a site's `importMap.js` changes.
  - `/contract` and `/lint` need no peers. `payload`, `react`, `@payloadcms/ui`, `typescript` (which `/generate` uses to read component source) and `vitest` (for `/testing`) are optional peers.

  `@forumone/throughline/components` now reads manifests through `@forumone/throughline-design-system/contract`.

- Updated dependencies [825f4e9]
  - @forumone/throughline-design-system@1.0.0-next.0

## 1.0.0-next.0

### Major Changes

- fb0b908: Jobs move in from `@forumone/throughline-workflows`, split by owner, by `docs/spec/1.0-exports.md`:

  - `defineJob`, the job types, `jobPayload`, `eventSenderFor`, `failureOptions` and the two failure handlers are on `@forumone/throughline/jobs`.
  - `inngestJobs` is on `/jobs/inngest`, beside the Inngest client; `payloadJobs` is on `/jobs/payload`.
  - `revalidateOnPublishJob`, `publishAtScheduledTimeJob`, `executeScheduledPublishesJob` and `createTagRevalidationHooks` are on `/publishing`; `expireStaleApprovalsJob` on `/approvals`; `auditEventEchoJob` on `/audit`; `healthcheckJob` and its checks on `/integrations`.
  - `createCacheTags` is on `/cache-tags`, which still imports nothing.

  **Removed:** the six Inngest-shaped factories, `createRevalidateOnPublishFunction`, `createPublishAtScheduledTimeFunction`, `createExecuteScheduledPublishesFunction`, `createExpireStaleApprovalsFunction`, `createAuditEventEchoFunction` and `createHealthcheckFunction`. Each was `inngestJobs(inngest).toFunction(<job>(options))`; write that instead, or better, give the adapter `onFailure` and `payload` once and pass the jobs to `jobs.functions([...])`. Function ids are unchanged. `BaseWorkflowOptions` and `AuditEventEchoOptions` no longer take an `inngest`.

- cb29249: `@forumone/throughline`: the 1.0 package, starting from `@forumone/throughline-core` and `@forumone/throughline-plugin-contract`.

  The root holds what is shared: environment checks, access helpers, the logger, utilities, the plugin and MCP tool types, and the MCP collector until `throughline()` wires it. Everything else is on a subpath: `/audit`, `/fields`, `/jobs`, `/jobs/inngest`, `/media` (now including reference tracking), `/observability`, `/testing`, `/client` and `/rsc`. The `throughline-payload` bin is unchanged.

  Moving from 0.x, by `docs/spec/1.0-exports.md`:

  - core's root no longer re-exports audit, events, references or observability; import them from `/audit`, `/jobs` and `/jobs/inngest`, `/media` and `/observability`.
  - `/events` is now `/jobs` (the event taxonomy) and `/jobs/inngest` (the Inngest client and Vercel environment pinning). Augment `CoreEvents` on `@forumone/throughline/jobs`.
  - `/references` is part of `/media`; `/env` and `/mcp` are part of the root; `/auth` is gone.
  - plugin-contract's types are on the root. Its separate `McpMeta` interface is gone; the root's `McpMeta` is the one.
  - Admin component paths are `@forumone/throughline/client#…` and `@forumone/throughline/rsc#UsedOnPanel`, so a site's `importMap.js` changes.

- 3b467f0: The last five 0.x server packages move in, by `docs/spec/1.0-exports.md`:

  - `@forumone/throughline-audit` joins core's audit writer on `@forumone/throughline/audit`. `DEFAULT_AUDIT_COLLECTION_SLUG` is gone; use `DEFAULT_AUDIT_SLUG`, the same value.
  - `@forumone/throughline-approvals` is `/approvals`. `APPROVALS_RESOLVER_SYMBOL` is internal.
  - `@forumone/throughline-components` is `/components`.
  - `@forumone/throughline-integrations` is `/integrations`; its `/client` (`SyncButton` and helpers) joins `@forumone/throughline/client`.
  - `@forumone/throughline-email` and its `/templates` are `/email`. `DEFAULT_APPROVALS_COLLECTION_SLUG` is gone; use `DEFAULT_APPROVALS_SLUG` from `/approvals`, the same value. `validateOptions` is internal.

  **Removed:** `createNotifyApprovalRequestFunction`, `createNotifyApprovalDecisionFunction` and `createNotifyApprovalExpiredFunction`. `emailPlugin` builds the same three Inngest functions itself, so `getEmailFunctions` and the function ids are unchanged; run `notify…Job` through an adapter to build one by hand.

  Admin component paths follow: `@forumone/throughline/client#SyncButton`. Plugin ids in the registry are `@forumone/throughline/<subpath>`, with the audit query plugin at `/audit-query`.

- ea3754f: Publishing moves in from `@forumone/throughline-publishing`, by `docs/spec/1.0-exports.md`:

  - `@forumone/throughline-publishing` and its `/checks` are `@forumone/throughline/publishing`.
  - `/editorial` is `@forumone/throughline/editorial`.
  - `/client` and `/rsc` are `@forumone/throughline/client` and `/rsc`, beside core's admin components.

  Admin component paths follow, so a site's `importMap.js` changes: `@forumone/throughline/client#PublishButton`, `#UnpublishButton`, `#SchedulePublishField`, `#CommandPalette` and `#ReportsNav`, and `@forumone/throughline/rsc#ContentHealthView`, `#ContentCalendarView` and `#YourWorkDashboard`. `next` and `@payloadcms/next` are optional peers, used only by those components.

The 0.x entries below are `@forumone/throughline-core`'s, which this package grew from.

## 0.15.0

### Minor Changes

- 430f566: Adds hardening for client uploads to Vercel Blob, moved from forumone-2026, at `@forumone/throughline-core/media`. Additive.

  With `@payloadcms/storage-vercel-blob`'s `clientUploads: true`, the browser PUTs straight to Blob, so Payload's own `upload.mimeTypes` and `validateSvg` never run, and the token is minted with `allowOverwrite: true`, so the object key is the only access control. These are the checks that do run:

  - **`uploadPrefixField()`, `uniqueUploadPrefix()`, `storageKey()`.** A random folder per upload, so a second upload of `hero.mp4` cannot replace the first's bytes, and the store cannot be enumerated by filename. Add the column with a migration that backfills `''`: an existing document must never get a prefix, or every file 404s.
  - **`refuseMimeTypesOutside(list, message?)`** (`beforeChange`) refuses a type off the list.
  - **`refuseStorageKeyMismatch()`** (`beforeChange`) refuses a client upload whose stored key and recorded key disagree, which would leave a link that 404s.
  - **`sanitizeStoredSvg()`** (`afterChange`) re-reads an SVG and writes back the allowlist-sanitised version (`sanitizeSvg`) when anything was removed.
  - **`recordStoredFacts({ mimeTypes })`** (`afterChange`) corrects `filesize` and `mimeType` to the stored object, not the in-memory conversion Payload measured.

  `@vercel/blob` and `@payloadcms/plugin-cloud-storage` are new optional peers, needed only by this subpath.

## 0.14.0

### Minor Changes

- fd4f42d: Three small 1.0 P2 items. Additive.

  - **`hardenCoreCollections(config, { canLock? })`** (core), moved from forumone-2026. It narrows `payload-locked-documents`, which Payload ships open to any authenticated principal, to editors and admins. Before, an approver or an MCP API key could delete the locks that `overrideLock: false` depends on, or lock every document. Apply it to the sanitized config: `buildConfig({...}).then(hardenCoreCollections)`. It throws if Payload ever renames the collection, rather than becoming a no-op.
  - **`list_job_failures`** (core): `jobFailuresPlugin({ mcpTools })` adds an MCP tool over the `job-failures` collection. It lists what failed, most recent first, filtered by `source`, `kind` or `sinceHours`, and reads as the caller, so the collection's read rule (admins, by default) decides who sees it.
  - **Terminal-failure handlers for the email and webhook functions.** `emailPlugin`'s three notifications and the webhook integration's two functions ran with no `onFailure`, so a run that exhausted its retries was silent. Both now default to `createTerminalFailureHandler({ payload })`, which records a `job-failures` row, logs and reports. `emailPlugin` and `integrationsPlugin` take `onTerminalFailure` to replace it. Integrations get it as `ctx.onFailure`, for their own functions: `inngestJobs(ctx.inngest, { onFailure: ctx.onFailure })`. Function ids and triggers are unchanged; Inngest adds a "(failure)" registration for each.

## 0.13.0

### Minor Changes

- 841b91b: Adds the field kit, moved from forumone-2026, at `@forumone/throughline-core/fields`, and the `check_slug` MCP tool. Additive.

  - `slugField`, `slugify`, and `refuseSlugHeldInTrash`. The slug follows the title until set, is normalised whenever it is set, and is never re-derived. The trash guard names the trashed document that holds a slug before the unique index refuses it with a bare error.
  - `publishedAtField` and `publishingFields`. The date is stamped on first publish, and kept when an open editor sends it back empty. `scheduledPublishField` is the field `publishingPlugin` schedules by.
  - `revisedAtField` and `contentRevisedAt`. They record when a person's change to a published document went public, not when the row last changed.
  - `unlistedField` and `LISTED`: live at its URL, absent from automatic lists.
  - `usedBy`: a signed-in-only join field for "where is this used?".
  - `mapFields`.
  - `characterCountPlugin`. Every capped text field gets a counter and a cap it can't be typed past. Its controls are at `@forumone/throughline-core/client`, and `@payloadcms/ui` is a new optional peer. Register it after every plugin that adds fields.
  - `fieldsPlugin({ mcpTools })` binds `check_slug`. The tool normalises a slug, says whether it's free in a collection (the trash included) and who holds it, and suggests the first free alternative.

  Every field keeps the name, type and index it had in forumone-2026, so adopting it changes no schema. The tool adds a checkbox to `payload-mcp-api-keys`, so a site that passes `mcpTools` needs a migration.

## 0.12.0

### Minor Changes

- 4289ee2: Adds reference tracking, moved from forumone-2026: what uses a document, a refusal to delete or trash it while anything does, a "Used on" panel, and the `find_references` and `can_delete` MCP tools. Additive.

  It works with blocks stored as JSON, which Payload cannot query. An upload inside a block has no foreign key, so deleting the image succeeded and it vanished from every page that showed it. The scan walks each collection's field config alongside its data, so it needs no list of field names, and reads both the published and draft state of every document.

  - `referencesPlugin({ collections, mcpTools })` guards each listed collection. It puts a `beforeDelete` refusal and a `beforeChange` trash refusal first in each hook list, and by default adds the panel as the first sidebar field. The refusal names the documents, says which use it inside a block, and fails closed: a scan that throws refuses rather than allows.
  - `findReferences`, `findReferencedIds`, `referencesIn` and the guard factories are exported for hosts that want them alone, from the root and from `@forumone/throughline-core/references`.
  - The panel is a server component at `@forumone/throughline-core/rsc#UsedOnPanel`, so a consumer that never renders the admin never loads React. React is an optional peer.
  - Blocks resolve from each `blocks` field, its `blockReferences` and the config's `blocks` registry, so no block list needs passing. Rich text is covered: `upload` and `relationship` nodes, and `block` and `inlineBlock` nodes walked as the block they name. forumone-2026's version missed blocks inside rich text.
  - The target's own collection is scanned too, skipping the document itself, so a taxonomy term's children are found without a second query.

  The two tools add two checkboxes to `payload-mcp-api-keys`, so a site that passes `mcpTools` needs a migration.

## 0.11.0

### Minor Changes

- a8e06fc: Adds Inngest environment pinning for Vercel, moved from forumone-2026. Additive.

  - `resolveInngestEnv()` returns `production` on Vercel production, `preview` for every Vercel preview, and `undefined` elsewhere, for `createInngestClient`'s `env`. Without it, the SDK names an environment after each branch, and each one runs a full copy of every cron. An explicit `INNGEST_ENV` still wins, and local dev is left alone even when `.env.local` came from `vercel env pull`.
  - `registrableInngestFunctions(functions)` drops the cron-only functions in a preview, and keeps any function an event also triggers. `registersInngestCrons()` is the predicate on its own.

## 0.10.0

### Minor Changes

- 006ae30: A missing environment variable is reported together with every other one, in a
  single error, instead of one plugin at a time.

  The plugins that read the environment at init now declare what they cannot
  start without, as data: `approvalsEnv` (`APPROVAL_TOKEN_SECRET`, 32+
  characters), `emailEnv` (`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`) and `formsEnv`
  (`FORMS_IP_HASH_SECRET`, 32+ characters). Each is a list of `EnvRequirement`
  (`{ name, minLength?, why }`), a new type in `plugin-contract`, and each
  plugin's own init check now reads the same entries, so the two cannot drift.
  An empty or whitespace-only value now counts as missing in those checks.

  Core exports `assertEnvironment(...checks)`. Call it first in
  `payload.config.ts` with the plugins' lists and your own variables; it throws
  one `EnvironmentError` whose first line reads "Configuration problem: N
  environment variables are missing or invalid", followed by every missing or
  too-short variable and why it is needed. Values are never printed. An argument
  can also be a function, for a rule that is not "this name, this long", such as
  a database URL accepted under several names. `checkEnvValue` is the one-value
  check behind it, for a plugin's own backstop.

  New projects call `assertEnvironment` at the top of `payload.config.ts` with
  `approvalsEnv`, `emailEnv`, `formsEnv`, `PAYLOAD_SECRET` (32+ characters),
  `NEXT_PUBLIC_SERVER_URL` and the database resolver, and `.env.example` marks
  which variables are checked. An existing site can do the same and delete any
  hand-kept copy of the plugins' requirements.

- 549d292: A `throughline-payload` bin: the Payload CLI, run so a hung command cannot outlive the shell that started it. pnpm does not forward signals to the node process it spawns, so a killed shell left `payload generate:types` running, and a hung one spinning on a core indefinitely.

  - Payload runs in its own process group; SIGINT, SIGTERM and SIGHUP are forwarded to the group, then SIGKILL after `PAYLOAD_CLI_GRACE_MS` (default 5s)
  - a wall clock, `PAYLOAD_CLI_TIMEOUT_MS` (default 5 minutes, `0` disables; none by default for `migrate*`), exits 124
  - each run is recorded in `.payload-cli-pids` at the workspace root, and the next run — or `throughline-payload --reap` — kills a recorded group whose runner was killed, after checking its pid, start time and command line

- 70385c4: A failed background job has somewhere to be recorded, and core can report errors.

  - **`job-failures` collection.** `jobFailuresPlugin()` from the new `@forumone/throughline-core/observability` subpath adds a read-only `job-failures` collection (admin-only by default) and attaches a writer that never throws; a row it cannot write is logged at `error` with the failure's summary and message. It is deliberately not the audit log: `audit-events` records MCP tool calls, its `mcpServer` column is required and constrained to MCP server names, and a cron that wrote there with any other value was rejected by Payload and silently dropped.
  - **Error reporting.** `createErrorReporter` / `reportError` post JSON reports to `ERROR_WEBHOOK_URL` (or a URL you pass), with a one-line `text` so a Slack incoming webhook works as-is, a 3-second timeout, and no throw on any failure. `buildRequestErrorReport` shapes what Next's `onRequestError` receives and copies request headers from an allowlist; `authorization`, `cookie`, `x-api-key` and `x-forwarded-for` are never copied. `describeErrorReporting` gives a boot-log sentence for on, off or misconfigured.

  **Migration required.** Registering `jobFailuresPlugin` adds a table (`job_failures`) and an enum (`enum_job_failures_kind`). Run `payload migrate:create` after adding it and commit the migration. The audit collection is unchanged.

- c8a86bf: Adds a `./testing` subpath with `describeAnonymousAccess(config, buckets)`. It registers a vitest suite that checks every collection's `read` rule against an anonymous request, with no database. Every collection in the config, including those added by plugins and by Payload, must be in exactly one bucket:

  - `renderPath`: read by the public site, so an anonymous read must be allowed. A collection with drafts must narrow that read with a query.
  - `private`: an anonymous read must be refused.

  A collection in no bucket fails, so adding a collection fails until somebody decides where it goes. `checkAnonymousAccess` returns the same findings as a list. `vitest` is an optional peer, and the main entry does not re-export the subpath.

- ab623e1: `mcpApiKeyAccess(isAdmin)` makes `payload-mcp-api-keys`, the key collection `@payloadcms/plugin-mcp` brings, admin-only. Pass it as `mcpPlugin({ overrideApiKeyCollection: mcpApiKeyAccess(isAdmin) })`. It applies the site's admin rule to `read`, `create`, `update`, `delete` and `unlock`, and refuses an MCP key principal before it asks the rule, so a key can never manage keys. It changes `access` and nothing else, so it composes with an override that also sets, say, `admin.group`.

  `isSignedIn(user)` and its `Access` form `signedIn` are a "signed in" check to use instead of `Boolean(req.user)`. They refuse an MCP key document on `req.user`, which Payload before 3.89.0 could put there on any REST route. `isMcpApiKeyPrincipal(user)` and `MCP_API_KEYS_SLUG` are exported for rules that need to tell the two apart directly. None of these affects `/api/mcp`, where a tool runs as the key's user.

- ab623e1: The `payload` peer range moves from `^3.0.0` to `^3.89.0` for every package that has one. **A site on Payload older than 3.89.0 must upgrade Payload before upgrading these packages.**

  Before 3.89.0, the `payload-mcp-api-keys` collection that `@payloadcms/plugin-mcp` adds registered Payload's API-key strategy on every REST route. Any key could then become `req.user` outside `/api/mcp` and pass access rules written as `Boolean(req.user)`. Every Throughline site runs that plugin, so the floor is the same for every package. No package's code changes with this bump.

- 36728c4: Collections that Throughline plugins declare now sit in a `Throughline` group in the admin sidebar, instead of loose at the top of it above every group. That covers `audit-events` (`auditPlugin`), the approvals collection (`approvalsPlugin`), `integrations` (`integrationsPlugin`), and `forms` and `form-submissions` (`formsPlugin`).

  Each of those plugins accepts `admin: { group }`, which applies to every collection it declares:

  - omitted: the `Throughline` group.
  - a string, or a locale map such as `{ en: 'Workflow', fr: 'Flux' }`: that group.
  - `false`: ungrouped, in Payload's default "Collections" section. This does not hide the collection, which is what `false` means on a collection's own `admin.group`.

  A site that groups these collections with its own config plugin can pass `admin: { group }` to each plugin and delete that code. `createAuditCollection`, `createApprovalsCollection` and `createIntegrationsCollection` accept the same `admin` option.

  `@forumone/throughline-plugin-contract` exports the shared pieces: `CollectionPluginOptions`, `PluginAdminOptions`, `PluginAdminGroup`, `DEFAULT_ADMIN_GROUP` and `resolveAdminGroup`, the helper a plugin spreads into each collection's `admin` block. `@forumone/throughline-core` re-exports the types.

### Patch Changes

- Updated dependencies [006ae30]
- Updated dependencies [ab623e1]
- Updated dependencies [36728c4]
  - @forumone/throughline-plugin-contract@0.5.0

## 0.9.1

### Patch Changes

- d02772f: A refused MCP tool call now carries MCP's `isError` flag.

  Every server in the suite answers a refusal with `{ error: … }` and returns it
  rather than throwing, so that a denial reads to the model as a denial rather
  than as a server fault. None of them set `isError`, so the refusal arrived as a
  **successful** tool result that happened to contain an `error` key: a client
  checking the protocol's flag instead of parsing the body read every refusal as
  a success.

  The publishing tools are where this was found, and they are the worst case for
  it. `@payloadcms/plugin-mcp` assigns no `req.user` — it mutates `docs[0].user`
  and passes it separately to its own CRUD tools — so `contextFrom(req)` reads
  `null` and _every_ `Bearer`-authenticated publishing call is refused at
  `actor.ts`'s identity guard. All of those refusals reported success.

  Fixed in `toPayloadMcpTool`, which is the one adapter every tool in all six
  servers passes through, so a tool written tomorrow is covered without its
  author knowing the file exists.

  **Nothing changes for a client that parses the body.** The content block is
  byte-identical, and `isError` is absent rather than `false` on a success, so a
  consumer reading `{ error }` today sees no difference. A consumer reading the
  flag now sees the truth instead of its opposite.

  The test is a non-empty string `error`, so a refusal that later grows a second
  field — a code, a retry hint — keeps its flag. The corollary is now documented
  on `deniedEnvelope`: `error` is reserved for refusals, and a success result
  reports failure through `ok`, `healthy`, `message` or `details`.

  Found exercising audit `04` F-02 against a real MCP key; forumone-2026#614.

## 0.9.0

### Minor Changes

- debfcd2: `system.error` now has a writer. Every MCP tool handler the suite serves is
  wrapped, so a tool that throws records one `system.error` audit row — the
  server, the tool, the caller, the caller's `_meta`, and the error's message —
  before the throw propagates to the MCP client as it did before.

  The row carries no stack and no arguments: `error_message` is readable by every
  admin and editor, a stack names file paths, and a tool's input can hold a draft
  body or a form submission. A failure inside the recording is logged and
  swallowed, so this wrapper can never replace a tool's real error with its own.

  `mcpServer` is resolved through a map rather than from the collector's own
  server name, because the two vocabularies disagree: the components server
  declares itself `components` and the audit enum's value is `component`. A
  server that passes an audit writer and has no name in that map is now a
  boot-time refusal instead of a row Payload silently rejects. New export:
  `auditServerFor`.

  Each of the six servers passes its audit writer to `collector.add`, alongside
  the logger it already passed. A host wiring a tool by hand passes none and gets
  the previous behaviour.

## 0.8.2

### Patch Changes

- 262768a: The five publishing MCP tools now refuse an unauthenticated call and run their
  reads and writes as the caller.

  `publish`, `unpublish`, `rollback`, `schedulePublish` and `getPublishStatus`
  built their actor without `enforceAccessAs`, which is the only thing that makes
  the service pass `{ user, overrideAccess: false }` to Payload. So every one of
  them ran at the Local API default of `overrideAccess: true` — publish,
  unpublish, roll back or schedule any document in any collection with no
  authorization check. `rollback` called `restoreVersion` with no user and no
  override flag at all.

  `tools/actor.ts` refuses when there is no identity and hands the caller to the
  service as the principal to enforce against. Deliberately not a role gate: the
  admin HTTP path already requires a user, sets `enforceAccessAs`, and lets the
  collection's own `update` rule decide. The MCP path now participates in that
  rather than carrying a second policy.

  **Behavioural change for consumers.** A tool call arriving with no `ctx.user`
  now returns `{ error: 'Must be authenticated…' }` instead of performing the
  operation. In practice that is every `Bearer`-authenticated MCP call, because
  `@payloadcms/plugin-mcp` does not assign `req.user` — which is why the audit,
  integrations and approvals servers already denied and these five did not.

  `@forumone/throughline-core`'s README claimed `requiredScope` is enforced —
  hidden from `tools/list` and refused unless granted. It was, by an `auth.ts`
  that "one MCP transport, not seven" (#80) removed along with the six
  per-server endpoints. The declarations survived; the enforcement did not. The
  README now says so, and says what gates a tool instead.

## 0.8.1

### Patch Changes

- 957403b: One `@types/node`, so a host does not end up with two copies of `@payloadcms/ui`

  Twelve packages asked for `@types/node@^20.17.0` and `design-system-payload`
  asked for `^24.13.2`. Inside this repository that is untidy. Inside a host that
  consumes the suite from source — which is how `forumone/forumone-2026` uses it,
  as a git submodule in one pnpm workspace — it is a runtime failure.

  pnpm hashes a package's identity with its resolved peers. `publishing` and
  `integrations` both take `@payloadcms/ui` as a peer _and_ as a devDependency, so
  each got its own copy resolved against `@types/node@20`, while the host's copy
  resolved against `@types/node@24`. Same version, 3.87.1, two directories:

      apps/web                     → @payloadcms+ui@3.87.1_…_9ce0de5c…
      packages/publishing          → @payloadcms+ui@3.87.1_…_13184ec4…
      packages/integrations        → @payloadcms+ui@3.87.1_…_13184ec4…

  Two directories are two module instances. Two instances of `@payloadcms/ui` are
  two `ConfigContext` objects, and `PublishButton` read the one the admin's
  provider had never populated:

      TypeError: Cannot destructure property 'config' of useConfig() as it is undefined

  The host saw an intermittent 500 on every admin document view — `PublishButton`
  is installed on each collection with a publish policy, so lists, `/admin` and
  the login screen were all fine and only editing broke. Nothing caught it:
  install, `--frozen-lockfile`, typecheck, lint and every test passed, because the
  two copies are byte-identical and the split exists only at module resolution.
  forumone/forumone-2026#498.

  Aligning on `^24.13.2` collapses them to one instance. Nothing here targets a
  Node 20 API deliberately; the packages typecheck and test unchanged against the
  newer types.

  `create-throughline` keeps `^20.17.0` on purpose. It is the one package
  declaring `engines.node: >=20.9.0`, and typechecking a CLI against types newer
  than the runtime it promises to support is how a Node 24-only call ships to
  somebody on Node 20.

- Updated dependencies [957403b]
  - @forumone/throughline-plugin-contract@0.4.1

## 0.8.0

### Minor Changes

- a9262da: Per-tool gating works, because tool names no longer wait for `onInit`

  `@payloadcms/plugin-mcp` generates one per-key checkbox per tool while the host's
  config is being built, and then gates every call on the checkbox matching the
  tool's name. Every Throughline tool was built at `onInit` — each closes over
  `payload`, the publishing service or the manifest loader — so the array it maps
  over was empty, no checkboxes were generated, and its `?? false` denied all 27
  tools to every key. A valid key got a 200 and an empty `tools/list`, with nothing
  wrong on either side.

  The plugin needs only `name` and `description` then, and neither needs a Payload.
  So a server now **declares** its tools as the config is built and **binds** their
  handlers at `onInit`:

  ```ts
  options.mcpTools?.declare(PUBLISHING_TOOL_DESCRIPTORS, { serverName: 'publishing' })
  // …later, at onInit:
  options.mcpTools?.add(tools, { serverName: 'publishing' })
  ```

  Each package gained a `tools/descriptors.ts` holding every tool's name and
  description; the factories spread from it, so the checkbox and the MCP client
  cannot describe a tool differently. A `descriptors.test.ts` in each package
  asserts the two sets match, without needing a database.

  `createMcpToolCollector` gains `declare()` and an `unbound` list. Both mismatches
  are refused rather than absorbed: a tool built but never declared throws at
  `onInit` (it would otherwise be denied to every key, silently), and a tool
  declared but never bound stays advertised with a handler that explains itself.

  **Order in the host's plugin array is now load-bearing.** Every tool-bearing
  server must come before `mcpPlugin`, or it declares into an array that has
  already been read. It was only a convention before; it is a requirement now, and
  the failure mode — a server's tools missing from every key — is the one this
  change exists to remove.

  `requiredScope` stays declared and read by nothing. Enforcement is the checkbox;
  these record which tools are consequential, and are the mapping a scope-aware
  default would be built from.

  The playground registers `mcpPlugin` for the first time, so the suite's only
  end-to-end host now exercises the tools rather than just their composition.

## 0.7.0

### Minor Changes

- 3140ea0: One MCP transport, not seven

  Every plugin served its own `POST /<prefix>/mcp` on a 146-line JSON-RPC subset of
  the protocol that spoke `tools/list` and `tools/call` and nothing else. Payload
  ships an MCP server built on the official SDK — streamable HTTP, sessions, per-key
  capability checkboxes — and the tools were never the transport. They now reach a
  client through the host's `@payloadcms/plugin-mcp`, on one `/api/mcp`, via the
  collector `createMcpToolCollector` already provided.

  **Breaking.** Removed from `@forumone/throughline-core`: `createMcpHandler`,
  `McpHandlerOptions`, `createApiKeysCollection`, `ApiKeysCollectionOptions`,
  `DEFAULT_API_KEYS_SLUG`, `createBearerTokenAuthenticator`,
  `BearerTokenAuthenticatorOptions`, `generateApiKey`. Removed from
  `@forumone/throughline-plugin-contract`: `McpAuthenticator`, `McpAuthResult`.
  `sha256Hex` stays exported, from `./utils` rather than `./auth`.

  `routePrefix` is gone from `auditQueryPlugin`, `componentsPlugin` and
  `integrationsPlugin` — omitted from their options types, so passing one is a
  compile error rather than config that reads as if it does something. `/mcp` was
  the only endpoint any of the three served. `publishingPlugin`, `approvalsPlugin`
  and `formsPlugin` keep theirs; they still serve admin controls, the approval
  action link and the public form post.

  **A host that passes no `mcpTools` collector now has no MCP surface.** There is no
  per-server endpoint left as a fallback. This is a config change of one line per
  plugin, and `createMcpToolCollector`'s own docs carry the shape.

  **What this costs, stated plainly.** `requiredScope` is now read by nothing —
  `plugin-mcp` gates on checkboxes generated at config time, which this suite cannot
  fill because every tool is built at `onInit`. So a key that authenticates reaches
  every collected tool, exactly as an all-or-nothing per-server key did. The
  declarations are kept because they are the mapping those checkboxes need; #78
  tracks restoring enforcement, and the type's own doc comment says so.

  Also drops the key collection from the playground, which leaves that app with no
  MCP surface at all until `mcpPlugin` can be wired there — #79, blocked on moving
  it off `payload@^3.83.0`.

### Patch Changes

- Updated dependencies [3140ea0]
  - @forumone/throughline-plugin-contract@0.4.0

## 0.6.0

### Minor Changes

- 9131065: Three helpers that existed once per package now exist once
  - **`unwrapRelationshipId`** had four definitions — three private to `approvals`, one exported from `email` — differing only in a null guard that `typeof value === 'string'` already covers. One deliberate change comes with the move: none of the four handled a _numeric_ id, so on Postgres at `depth: 0` they returned `null` for a relationship that was populated fine. No caller reads at depth 0 today, so this fixes nothing and stops a shared helper being wrong for the first caller that does.
  - **`deniedEnvelope`** had three identical definitions, one per server with an access predicate. The role predicates stay where they are: what counts as an audit reader is not what counts as a forms author, and collapsing those would put one package's policy in another's file.
  - **The MCP handler rebuilt `createNamedLogger` inline**, forty lines from the real one in the same package.

  Nothing else in the duplication audit survived checking. `createFakePayload` has six definitions and three distinct implementations — a query engine, a two-line map read, and a stateful form store — which share a name and nothing else; merging them means building a fake that does all three jobs. `createFakeInngest` has one definition and three importers. The six MCP endpoint stanzas are real duplication that should be deleted rather than merged, once hosts move to `@payloadcms/plugin-mcp`.

## 0.5.0

### Minor Changes

- 1a4a441: Let every server's tools be served by Payload's own MCP plugin

  `createMcpToolCollector()` in core, and an `mcpTools` option on all six servers. The host hands the collector's array to `@payloadcms/plugin-mcp` at config time and each plugin fills it at `onInit` — which works because the plugin reads `mcp.tools` inside the handler it builds per request, so an array handed over empty is read populated.

  That ordering is the whole problem this solves: every tool in the suite is built at `onInit` because every one closes over `payload`, and `mcpPlugin` takes its tools as a config option.

  Omit `mcpTools` and nothing changes — each server keeps its own `/mcp` endpoint, which is what lets a host move one at a time rather than all six at once.

  Duplicate tool names are refused, naming both servers. Six servers each owning a `publish` was fine while each had its own endpoint; one server is one namespace, and an MCP client offered two tools under one name gets whichever registered last.

  **Also fixes a defect the integration test found.** `service.loadDocument` called `findByID` without `disableErrors`, so a missing document threw `NotFound` before the pipeline ran — which made the `exist` step's `not-found` branch unreachable from every caller, and turned "publish a document that does not exist" into a thrown error instead of the diagnostic the pipeline exists to return. The step's own tests passed it an empty document and so never noticed. `unpublish` now distinguishes a missing document from one that is merely already a draft.

## 0.4.0

### Minor Changes

- 40839b5: Stop publishing code nothing imports

  `@forumone/throughline-core` loses three things no package in the suite, and no consumer, has ever called:
  - **`./env`** — `ENV_VARS`, `validateBaseEnv`, `requireEnv`, `optionalEnv`, and the subpath export that served them. The idea was that plugins would read `process.env` through shared constants instead of hard-coded strings; every plugin hard-codes the string, including the ones in this repo. A convention with no adherents is not a convention.
  - **`shallowDiff`** — written for the audit writer's `diff` field, never wired to it. The writer still takes a caller-supplied diff, and Payload's own version diffing is the better answer if one is ever wanted.
  - **`generateId`** — an id generator in a framework where Payload assigns the ids.

  `@forumone/throughline-plugin-contract` stops shipping `examplePlugin`. It is documentation of a shape, and it now lives in the playground, which is where a shape gets demonstrated — the published package was carrying 74 lines of example for every consumer that installs it.

  Removing exports from a published package, hence minor rather than patch. Nothing in this repository, and nothing in the suite's only consumer, imports any of it.

- 9f39ace: Enforce API-key scopes, which until now were only a label

  The API-keys collection has always had a required `scopes` field, the README has always told you to mint keys with `--scopes publishing.execute`, and the scheduled-publish factory documents that its key "must carry `publishing.execute` scope". Nothing read the field. Every key could do whatever its linked user could, whatever it said on the label.

  A tool may now declare `requiredScope`, and the handler holds callers to it: the tool is hidden from `tools/list` and refused on a direct call unless the key names that scope. Hidden as well as refused, because an agent shown a tool it will be turned away from will try it, fail, and report the tool as broken when what is narrow is the key.

  The consequential tools are annotated — `publish`, `unpublish`, `schedule_publish`, `rollback` (`publishing.execute`); `request_approval` (`approvals.request`); `respond_to_approval` (`approvals.decide`); the three form writers (`forms.manage`); `trigger_sync` and `test_integration` (`integrations.trigger`). Reads are left unscoped, which is the right default for a read.

  **This narrows existing keys.** A key minted with one scope could previously call every tool on every server and now cannot. That is the point, but it will change what an existing MCP client can do — check the scopes on your keys before upgrading. A key carrying no scopes at all passes nothing scoped: absent is read as none, not as everything.

- f138b3d: One audit actor shape for every tool, and stop recording agents as people

  Ten tools built the audit actor by hand and four of them disagreed. Three were only untidy — a dropped `userName`, conditional spreads, an assumption that `ctx.user` is non-null. The fourth was wrong: the component tools wrote `type: 'user'` unconditionally, so a call made with an API key and no linked user was recorded as a person. An audit log that cannot tell an agent from an editor is not an audit log.

  `auditContext(ctx, meta)` is now exported from core and used at all eight tool call sites. `type` follows the rule the publishing service already used — a call carrying a user is that user's, one without is the system's — and `apiKeyName` rides along either way, because a key acting for a linked user is still worth naming.

  It also passes `sessionId` through for the first time. The column has been on the audit collection since it was written and nothing ever filled it; it is what lets somebody reading the log group one conversation's writes instead of reading them one at a time.

- 6fac789: Add `toPayloadMcpTool`, so Throughline's tools can be served by Payload's own MCP plugin

  Payload ships `@payloadcms/plugin-mcp`, exact-pinned to the Payload version, built on the official MCP SDK: streamable HTTP, sessions, per-key per-tool capability checkboxes, and generic CRUD tools derived from the field configs. Against that, `createMcpHandler` here is a 146-line JSON-RPC subset speaking `tools/list` and `tools/call`, mounted six times over.

  The transport was never the product. The tools are. This adapter is what makes moving between the two a configuration change rather than a rewrite of every tool: it translates the input schema (`withMeta`'s `z.object` to the raw shape the plugin registers), the context (a `PayloadRequest` to an `McpToolContext`), and the result (a tool's own object to MCP content blocks).

  Nothing is wired to it. It is the outcome of a spike, and the servers move over one at a time.

### Patch Changes

- Updated dependencies [40839b5]
- Updated dependencies [9f39ace]
  - @forumone/throughline-plugin-contract@0.3.0

## 0.3.0

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

## 0.2.2

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

- Updated dependencies [7ee992d]
  - @forumone/throughline-plugin-contract@0.2.1

## 0.2.1

### Patch Changes

- a4b5108: Initial release of the forms package. Wraps Payload's Form Builder plugin with the Throughline policy layer: mandatory privacy notice, consent enforcement (server-side), honeypot spam protection, Postgres-backed per-IP rate limiting, a destination allowlist (the security perimeter), and submitter confirmations. Six MCP tools (`list_allowed_destinations`, `validate_form`, `create_form`, `update_form_fields`, `update_form_destinations`, `get_form_submissions`) and four Inngest functions (`form-fan-out`, `form-email-destination`, `form-webhook-destination`, `form-submitter-confirmation`) drive the conversational flow and the async destination delivery. Includes `FormSubmissionEmail` and `SubmitterConfirmationEmail` React Email templates. Allowlist enforcement runs at three layers (MCP tool, collection beforeChange hook, fan-out worker) so prompt injection or admin direct-API writes can't bypass it. IPs are HMAC-hashed; raw IPs are never persisted. Adds `form.updated` to the core audit-action taxonomy used by the two update tools.

## 0.2.0

### Minor Changes

- [#14](https://github.com/forumone/throughline/pull/14) [`5329d97`](https://github.com/forumone/throughline/commit/5329d97363099a54bcae2516a8aa9eff8cd735fc) Thanks [@briangraves](https://github.com/briangraves)! - Initial release. Provides the audit log (collection + fire-and-forget writer + plugin), MCP authentication (bearer-token authenticator + API-keys collection with SHA-256 hashed keys), event taxonomy and Inngest client factory, MCP handler infrastructure (JSON-RPC over HTTP) with the `_meta` helper for prompt/reasoning capture, standard env-var conventions, a default logger, and shared utilities. Every server package in the framework depends on this.

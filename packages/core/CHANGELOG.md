# @forumone/throughline-core

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

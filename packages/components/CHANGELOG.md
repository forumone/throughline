# @forumone/throughline-components

## 0.5.5

### Patch Changes

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

- Updated dependencies [debfcd2]
  - @forumone/throughline-core@0.9.0

## 0.5.4

### Patch Changes

- Updated dependencies [262768a]
  - @forumone/throughline-core@0.8.2

## 0.5.3

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
  - @forumone/throughline-core@0.8.1
  - @forumone/throughline-design-contract@0.5.1
  - @forumone/throughline-plugin-contract@0.4.1

## 0.5.2

### Patch Changes

- Updated dependencies [45724ee]
  - @forumone/throughline-design-contract@0.5.0

## 0.5.1

### Patch Changes

- Updated dependencies [14f2be4]
  - @forumone/throughline-design-contract@0.4.0

## 0.5.0

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

### Patch Changes

- Updated dependencies [a9262da]
  - @forumone/throughline-core@0.8.0

## 0.4.0

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
  - @forumone/throughline-core@0.7.0

## 0.3.1

### Patch Changes

- Updated dependencies [9131065]
  - @forumone/throughline-core@0.6.0

## 0.3.0

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

## 0.2.7

### Patch Changes

- f138b3d: One audit actor shape for every tool, and stop recording agents as people

  Ten tools built the audit actor by hand and four of them disagreed. Three were only untidy — a dropped `userName`, conditional spreads, an assumption that `ctx.user` is non-null. The fourth was wrong: the component tools wrote `type: 'user'` unconditionally, so a call made with an API key and no linked user was recorded as a person. An audit log that cannot tell an agent from an editor is not an audit log.

  `auditContext(ctx, meta)` is now exported from core and used at all eight tool call sites. `type` follows the rule the publishing service already used — a call carrying a user is that user's, one without is the system's — and `apiKeyName` rides along either way, because a key acting for a linked user is still worth naming.

  It also passes `sessionId` through for the first time. The column has been on the audit collection since it was written and nothing ever filled it; it is what lets somebody reading the log group one conversation's writes instead of reading them one at a time.

- Updated dependencies [40839b5]
- Updated dependencies [9f39ace]
- Updated dependencies [f138b3d]
- Updated dependencies [6fac789]
  - @forumone/throughline-core@0.4.0
  - @forumone/throughline-plugin-contract@0.3.0

## 0.2.6

### Patch Changes

- Updated dependencies [d20f909]
  - @forumone/throughline-core@0.3.0

## 0.2.5

### Patch Changes

- Updated dependencies [24bd325]
  - @forumone/throughline-design-contract@0.3.0

## 0.2.4

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

- Updated dependencies [7ee992d]
  - @forumone/throughline-plugin-contract@0.2.1
  - @forumone/throughline-core@0.2.2

## 0.2.3

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1

## 0.2.2

### Patch Changes

- [`123d2ea`](https://github.com/forumone/throughline/commit/123d2ea0172d9495b9e2c8e8c6039e623f5fba66) Thanks [@briangraves](https://github.com/briangraves)! - The plugin now attaches an in-process composition validator to the Payload instance under `Symbol.for('@forumone/throughline/components-validator')`. The publishing server's pipeline reads that symbol to validate compositions during the publish flow without round-tripping through the MCP transport. Adds the `'composition-validation'` capability to the plugin's registry entry.

## 0.2.1

### Patch Changes

- [`3ff1e9f`](https://github.com/forumone/throughline/commit/3ff1e9f43fad2e15fd42f67073227259ba7e78d4) Thanks [@briangraves](https://github.com/briangraves)! - Fix: drop the `/api` prefix from `componentsPlugin`'s default `routePrefix` so the endpoint registers at `/api/components/mcp` rather than `/api/api/components/mcp`. Payload mounts top-level endpoints under its API base (`config.routes.api`, default `/api`), which the previous default doubled. Consumers who pass an explicit `routePrefix` should also drop any leading `/api`.

## 0.2.0

### Minor Changes

- [#16](https://github.com/forumone/throughline/pull/16) [`4db5168`](https://github.com/forumone/throughline/commit/4db5168cfe83922ad371b7927029c21b009b1e53) Thanks [@briangraves](https://github.com/briangraves)! - Initial release. MCP server that exposes a design system manifest as seven conversational tools: `list_components`, `get_contract`, `get_variants`, `get_tokens`, `suggest_for_intent`, `validate_composition`, `find_anti_pattern`. Ships TF-IDF intent matching (no external deps); embeddings strategy reserved for a follow-up release. Accepts manifests as imported objects, remote URLs (with `refreshInterval`), or Payload collections.

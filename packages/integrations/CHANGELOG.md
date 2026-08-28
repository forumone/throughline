# @forumone/throughline-integrations

## 0.7.0

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

## 0.6.0

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

## 0.5.0

### Minor Changes

- 0d7501d: `Integration.createFunctions` is generic in its return type

  It named `InngestFunction.Any`, and nothing in this package inspects or invokes what comes back — the one use anywhere is `.length`, for a log line saying how many functions an integration contributed. The host serves them.

  Naming the type cost a consumer two casts. pnpm keys an `inngest` instance by its resolved peer set, and `inngest` declares optional peers on `express`, `hono` and `next` — so a host that installs anything pulling one of those in (in this case `@payloadcms/plugin-mcp`, via `mcp-handler`) ends up with a structurally identical, nominally different `InngestFunction.Any`, and the assignment stops compiling.

  Generic, the host's own type flows through:

  ```ts
  export const myIntegration: Integration<MyConfig, InngestFunction.Any> = { … }
  ```

  `unknown` by default, so nothing existing has to change — `webhookIntegration` in this package is untouched.

- 88d7e4f: `IntegrationRegistry` and `getIntegrationRegistry` are generic in the function type too

  Making `Integration.createFunctions` generic was half the fix: the registry still stored integrations at the default `unknown`, so `list()` handed back `unknown[]` and a host had to assert its way back to its own Inngest type before calling `serve()` — the assertion the generic existed to delete.

  `getIntegrationRegistry<InngestFunction.Any>(payload)` now names it once, where the host reads the registry, and the type survives the round trip.

  `unknown` by default, so nothing existing changes.

### Patch Changes

- 9131065: Three helpers that existed once per package now exist once
  - **`unwrapRelationshipId`** had four definitions — three private to `approvals`, one exported from `email` — differing only in a null guard that `typeof value === 'string'` already covers. One deliberate change comes with the move: none of the four handled a _numeric_ id, so on Postgres at `depth: 0` they returned `null` for a relationship that was populated fine. No caller reads at depth 0 today, so this fixes nothing and stops a shared helper being wrong for the first caller that does.
  - **`deniedEnvelope`** had three identical definitions, one per server with an access predicate. The role predicates stay where they are: what counts as an audit reader is not what counts as a forms author, and collapsing those would put one package's policy in another's file.
  - **The MCP handler rebuilt `createNamedLogger` inline**, forty lines from the real one in the same package.

  Nothing else in the duplication audit survived checking. `createFakePayload` has six definitions and three distinct implementations — a query engine, a two-line map read, and a stateful form store — which share a name and nothing else; merging them means building a fake that does all three jobs. `createFakeInngest` has one definition and three importers. The six MCP endpoint stanzas are real duplication that should be deleted rather than merged, once hosts move to `@payloadcms/plugin-mcp`.

- Updated dependencies [9131065]
  - @forumone/throughline-core@0.6.0

## 0.4.0

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

## 0.3.0

### Minor Changes

- 9f39ace: Enforce API-key scopes, which until now were only a label

  The API-keys collection has always had a required `scopes` field, the README has always told you to mint keys with `--scopes publishing.execute`, and the scheduled-publish factory documents that its key "must carry `publishing.execute` scope". Nothing read the field. Every key could do whatever its linked user could, whatever it said on the label.

  A tool may now declare `requiredScope`, and the handler holds callers to it: the tool is hidden from `tools/list` and refused on a direct call unless the key names that scope. Hidden as well as refused, because an agent shown a tool it will be turned away from will try it, fail, and report the tool as broken when what is narrow is the key.

  The consequential tools are annotated — `publish`, `unpublish`, `schedule_publish`, `rollback` (`publishing.execute`); `request_approval` (`approvals.request`); `respond_to_approval` (`approvals.decide`); the three form writers (`forms.manage`); `trigger_sync` and `test_integration` (`integrations.trigger`). Reads are left unscoped, which is the right default for a read.

  **This narrows existing keys.** A key minted with one scope could previously call every tool on every server and now cannot. That is the point, but it will change what an existing MCP client can do — check the scopes on your keys before upgrading. A key carrying no scopes at all passes nothing scoped: absent is read as none, not as everything.

### Patch Changes

- Updated dependencies [40839b5]
- Updated dependencies [9f39ace]
- Updated dependencies [f138b3d]
- Updated dependencies [6fac789]
  - @forumone/throughline-core@0.4.0
  - @forumone/throughline-plugin-contract@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [d20f909]
  - @forumone/throughline-core@0.3.0

## 0.2.2

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

- Updated dependencies [7ee992d]
  - @forumone/throughline-plugin-contract@0.2.1
  - @forumone/throughline-core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1

## 0.2.0

### Minor Changes

- 789dbd8: Initial release of the integrations server. Provides the `Integration` plugin contract every future integration (Salesforce, Mailchimp, etc.) follows, the registry, the admin-only Integrations collection, and five MCP tools (`list_integrations`, `get_integration_status`, `trigger_sync`, `test_integration`, `list_integration_types`). Includes a generic outbound webhook integration with HMAC-SHA256 signing (RFC 4231 known-answer tests pinned), configurable event filter / payload mode / timeout, healthcheck, and Inngest-driven retries. Configuration is admin-only by design — Claude can trigger and observe integrations but cannot retarget URLs or rotate secrets.

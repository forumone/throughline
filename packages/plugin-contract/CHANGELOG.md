# @forumone/throughline-plugin-contract

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

## 0.3.0

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

## 0.2.1

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

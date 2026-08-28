---
'@forumone/throughline-plugin-contract': minor
'@forumone/throughline-integrations': minor
'@forumone/throughline-publishing': minor
'@forumone/throughline-components': minor
'@forumone/throughline-approvals': minor
'@forumone/throughline-audit': minor
'@forumone/throughline-forms': minor
'@forumone/throughline-core': minor
---

One MCP transport, not seven

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

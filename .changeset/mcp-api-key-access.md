---
'@forumone/throughline-core': minor
---

`mcpApiKeyAccess(isAdmin)` makes `payload-mcp-api-keys`, the key collection `@payloadcms/plugin-mcp` brings, admin-only. Pass it as `mcpPlugin({ overrideApiKeyCollection: mcpApiKeyAccess(isAdmin) })`. It applies the site's admin rule to `read`, `create`, `update`, `delete` and `unlock`, and refuses an MCP key principal before it asks the rule, so a key can never manage keys. It changes `access` and nothing else, so it composes with an override that also sets, say, `admin.group`.

`isSignedIn(user)` and its `Access` form `signedIn` are a "signed in" check to use instead of `Boolean(req.user)`. They refuse an MCP key document on `req.user`, which Payload before 3.89.0 could put there on any REST route. `isMcpApiKeyPrincipal(user)` and `MCP_API_KEYS_SLUG` are exported for rules that need to tell the two apart directly. None of these affects `/api/mcp`, where a tool runs as the key's user.

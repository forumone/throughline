---
'@forumone/create-throughline': patch
---

The scaffolded `payload.config.ts` uses core's `mcpApiKeyAccess(isAdmin)` to make the MCP key collection admin-only, replacing the inline override. It now also covers `unlock` and refuses a key principal outright. The scaffold depends on `payload` and `@payloadcms/*` `^3.89.0`.

---
'@forumone/create-throughline': patch
---

The scaffold compiles against the current Throughline releases, and serves its tools over MCP:

- `payload.config.ts` no longer imports `createApiKeysCollection`, which core removed.
- One `createMcpToolCollector()` is passed to every tool-bearing plugin, and `@payloadcms/plugin-mcp` is registered after them, with its key collection narrowed to admins.
- The Inngest route types the integration registry, so `serve()` can type its function list.
- `@payloadcms/plugin-form-builder` is a caret range like the rest of `@payloadcms/*`, so it no longer installs a second `@payloadcms/ui`.
- `.env.example` and the printed next steps drop the per-server MCP keys that no longer exist.

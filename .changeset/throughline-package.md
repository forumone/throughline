---
'@forumone/throughline': major
---

`@forumone/throughline`: the 1.0 package, starting from `@forumone/throughline-core` and `@forumone/throughline-plugin-contract`.

The root holds what is shared: environment checks, access helpers, the logger, utilities, the plugin and MCP tool types, and the MCP collector until `throughline()` wires it. Everything else is on a subpath: `/audit`, `/fields`, `/jobs`, `/jobs/inngest`, `/media` (now including reference tracking), `/observability`, `/testing`, `/client` and `/rsc`. The `throughline-payload` bin is unchanged.

Moving from 0.x, by `docs/spec/1.0-exports.md`:

- core's root no longer re-exports audit, events, references or observability; import them from `/audit`, `/jobs` and `/jobs/inngest`, `/media` and `/observability`.
- `/events` is now `/jobs` (the event taxonomy) and `/jobs/inngest` (the Inngest client and Vercel environment pinning). Augment `CoreEvents` on `@forumone/throughline/jobs`.
- `/references` is part of `/media`; `/env` and `/mcp` are part of the root; `/auth` is gone.
- plugin-contract's types are on the root. Its separate `McpMeta` interface is gone; the root's `McpMeta` is the one.
- Admin component paths are `@forumone/throughline/client#…` and `@forumone/throughline/rsc#UsedOnPanel`, so a site's `importMap.js` changes.

---
'@forumone/throughline-integrations': minor
---

`Integration.createFunctions` is generic in its return type

It named `InngestFunction.Any`, and nothing in this package inspects or invokes what comes back — the one use anywhere is `.length`, for a log line saying how many functions an integration contributed. The host serves them.

Naming the type cost a consumer two casts. pnpm keys an `inngest` instance by its resolved peer set, and `inngest` declares optional peers on `express`, `hono` and `next` — so a host that installs anything pulling one of those in (in this case `@payloadcms/plugin-mcp`, via `mcp-handler`) ends up with a structurally identical, nominally different `InngestFunction.Any`, and the assignment stops compiling.

Generic, the host's own type flows through:

```ts
export const myIntegration: Integration<MyConfig, InngestFunction.Any> = { … }
```

`unknown` by default, so nothing existing has to change — `webhookIntegration` in this package is untouched.

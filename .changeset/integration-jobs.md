---
'@forumone/throughline-integrations': minor
---

Integrations run on any jobs runner.

- `Integration.createJobs(getContext)` is an optional contract method returning runner-neutral jobs. It takes a function rather than a context, because a jobs adapter receives its jobs before the context exists. An integration without it runs on Inngest only, exactly as today.
- The built-in webhook implements `createJobs`, and derives `createFunctions` from it. A snapshot written before the port holds its Inngest registration unchanged.
- `integrationsJobs(options)` returns every registered integration's jobs, the webhook included, for a site on `payloadJobs`. Each job reads the integrations context from Payload when it runs.
- `IntegrationContext.emit` sends an event on whichever runner the site uses.
- `integrationsPlugin` accepts `emit` (for example `payloadJobs().emit`) in place of `inngest`, and needs one of the two.
  - Manual syncs, through the sync endpoint and `trigger_sync`, send through it.
  - On a site with no Inngest client, `ctx.inngest` is a guard that names the fix if anything uses it, so existing integrations keep compiling.

---
'@forumone/throughline-integrations': minor
---

`IntegrationRegistry` and `getIntegrationRegistry` are generic in the function type too

Making `Integration.createFunctions` generic was half the fix: the registry still stored integrations at the default `unknown`, so `list()` handed back `unknown[]` and a host had to assert its way back to its own Inngest type before calling `serve()` — the assertion the generic existed to delete.

`getIntegrationRegistry<InngestFunction.Any>(payload)` now names it once, where the host reads the registry, and the type survives the round trip.

`unknown` by default, so nothing existing changes.

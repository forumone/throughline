---
'@forumone/throughline-integrations': minor
---

Sync now: a button on the integrations document, and the endpoint behind it

Manual sync was complete except for any way to reach it. The
`integration/manual-sync` event existed, every integration handled it, the run
wrote `lastSyncAt` / `lastSyncStatus` / `lastError` and an audit row — and the
only ways in were a `trigger_sync` MCP call, which needs a minted API key and a
JSON-RPC round trip, or hand-sending the event in the Inngest dashboard. Neither
is available to the operator who has just rotated a token or fixed a record
upstream and is looking at the instance in the admin, where the next scheduled
run may be an hour away.

- **`requestManualSync()`** is now the one definition of what a trigger means:
  the instance exists, the instance is enabled, this event shape. The MCP tool
  calls it, and so does the new endpoint, so the two cannot drift.
- **`POST /api/<integrations>/:id/sync`** — session-cookie auth, admin only,
  `202` when queued, `404` / `409` / `502` for an unknown id, a disabled
  instance, and an Inngest that would not take the event.
- **A Sync now button** in the document sidebar, above `lastSyncAt`. It says the
  run was queued rather than implying a result it does not have, then watches
  `lastSyncAt` for two minutes and reports the outcome when it moves.

An unreachable Inngest used to escape `trigger_sync` as an unhandled rejection
and reach the caller as a generic tool failure. It is now a refusal that says
nothing was queued — the distinction a button depends on, since a sync that was
never requested otherwise looks exactly like one that has not finished.

This is the package's first admin component, so hosts must run
`payload generate:importmap` after upgrading; a stale import map 500s the admin
screen. `react` and `@payloadcms/ui` are optional peers, needed only by
`@forumone/throughline-integrations/client`.

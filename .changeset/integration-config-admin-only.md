---
'@forumone/throughline-integrations': patch
---

The credentials come out of an editor's read of an integration

`integrations` grants document read to an admin *or* an editor, and it should:
the reason an editor opens this collection is to see whether last night's sync
ran. The collection's docblock has always said so — "editors can read instance
status" — but a document read hands over the whole document, and `config` is one
JSON column holding whatever an integration needs to authenticate. A HubSpot
private app token, a webhook signing secret, a target URL. So *status* was a
description of the intent, not of the code, and every editor could read every
credential from `GET /api/<slug>` and from the admin screen.

`config` now carries its own `read` / `create` / `update`, admin-only. An
editor's read returns the row without it: `name`, `enabled`, `lastSyncAt`,
`lastSyncStatus` and `lastError` are untouched, which is the whole of what the
status view and the `list_integrations` / `get_integration_status` tools project
anyway.

Nothing that needs the value loses it. Every reader of `config` goes through the
Local API — `loadInstances` here, and a host's sync and form endpoints — which
overrides access. The MCP tools never emitted the field.

`create` and `update` are redundant today, since the collection's own create and
update are already admin-only. They are there for the day document write is
widened so an editor can correct a status, and are the reason that day does not
also hand over the credential.

A `configFields` entry cannot do this itself: those drive the admin UI, and the
schema has one `json` column behind them, so there is no per-key field for
Payload to gate. Anything secret in `config` is protected by this rule or not at
all.

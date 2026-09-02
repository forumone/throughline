# @forumone/throughline-integrations

Plugin architecture for connecting Throughline-powered Payload sites to external systems. Ships the `Integration` contract every future integration follows, the registry, the per-instance configuration collection, five MCP tools, and a generic outbound webhook integration as the reference implementation.

## What this package provides

- **`Integration` contract** — id, name, description, configFields, validateConfig, subscribes, createFunctions, mcpTools (optional), healthcheck. Every Salesforce / Mailchimp / Slack / etc. integration uses this exact shape.
- **`IntegrationRegistry`** — process-local, per-plugin-init store keyed by integration id. Rejects duplicates synchronously.
- **Integrations collection** — `name`, `integrationType`, `enabled`, `config` (json), and read-only `lastSyncAt` / `lastSyncStatus` / `lastError`. Admin-only writes; admin/editor reads.
- **A Sync now button**, in the document's sidebar beside those status fields, and the `POST /api/<slug>/:id/sync` endpoint behind it. See below.
- **Five MCP tools**, handed to the host's collector at `onInit` and served by `@payloadcms/plugin-mcp` on one `/api/mcp`. Pass `mcpTools` or they reach nobody:

| Tool | Use it for | Access |
|---|---|---|
| `list_integrations` | "What integrations are configured?" / "Which are healthy?" | admin / editor |
| `get_integration_status` | One instance's last-sync info | admin / editor |
| `trigger_sync` | Manual delivery to verify connectivity after a config change | admin only |
| `test_integration` | Run the integration's healthcheck (no event emitted) | admin / editor |
| `list_integration_types` | "What kinds of integrations are supported here?" | any caller |

- **Webhook integration** — generic outbound HTTPS POST with HMAC-SHA256 signing, configurable event filter, retries (5x), timeout, and a HEAD-based healthcheck. RFC 4231 known-answer test vectors pin the wire format so refactoring can never silently break receivers.

## Triggering a sync from the admin

Everything behind a manual sync — the `integration/manual-sync` event, a handler on every integration, the status fields, the audit rows — was reachable only over MCP or by hand-sending an event in the Inngest dashboard. Neither is available to the person who has just fixed a record in the upstream system and wants it on the site before the next cron.

So the collection ships one admin component: **Sync now**, in the sidebar, above `lastSyncAt`. It POSTs to a collection endpoint:

```
POST /api/integrations/:id/sync      { "reason": "optional" }
```

authenticated by the Payload session cookie — no API key in the operator's path — and admin-only, matching `trigger_sync`. The endpoint and the tool both call `requestManualSync()`, which is the single definition of what a trigger checks and what event it sends; neither re-implements the rules.

| Answer | Means |
|---|---|
| `202` | Queued. The run has **not** happened yet. |
| `403` | Not an admin. |
| `404` | No instance with that id. |
| `409` | The instance is disabled. Enable it first. |
| `502` | Inngest would not take the event — nothing was queued. |

`202`, not `200`: it fires an event and returns. The button says the run was queued, then watches `lastSyncAt` for two minutes and reports the outcome when it moves — against the value the endpoint returned rather than what the page last rendered, so a cron run that lands mid-wait is not mistaken for this one. Giving up watching is not failing, and the copy says so.

`requestManualSync` and `createSyncEndpoint` are exported, so a host with its own screen can reuse either.

Because this is the package's first admin component, hosts must run `payload generate:importmap` after upgrading. A stale import map 500s the admin screen.

## Why this is separate from the other server packages

The other server packages do one job well. This is a **framework within the framework**: a contract for integration modules plus tooling to register, configure, observe, and trigger them. Every real client engagement needs integrations; building them ad-hoc produces unmaintainable tangle. This package keeps the surface area bounded as the integration count grows.

## Installation

```bash
pnpm add @forumone/throughline-integrations
```

Peers: `payload@^3.0.0`, `inngest@^4.0.0`. Required runtime peer: `@forumone/throughline-core` (audit log). `react` and `@payloadcms/ui` are optional peers, needed only to render the Sync now button — a host that never loads `@forumone/throughline-integrations/client` needs neither.

## Usage

```ts
import { buildConfig } from 'payload'
import { auditPlugin, createInngestClient } from '@forumone/throughline-core'
import { integrationsPlugin } from '@forumone/throughline-integrations'

const inngest = createInngestClient({ id: 'my-site' })

export default buildConfig({
  // collections, db, secret...
  plugins: [
    auditPlugin({ inngest }),
    integrationsPlugin({ inngest }),
  ],
})
```

## Adding integrations

```ts
import { integrationsPlugin } from '@forumone/throughline-integrations'
import { salesforceIntegration } from '@your-org/throughline-salesforce'

integrationsPlugin({
  inngest,
  integrations: [salesforceIntegration],
})
```

The webhook integration is registered automatically. Additional integrations are appended; duplicate ids throw at plugin init.

## Wiring Inngest functions

Integration `createFunctions` returns Inngest functions, but **this plugin does not serve them**. The client app's Inngest endpoint composes them with its own functions. See [`docs/integrations-wiring.md`](../../docs/integrations-wiring.md) in the repository root for the pattern.

## Why configuration is admin-only

A prompt-injection attacker could otherwise convince Claude to retarget a webhook to attacker-controlled infrastructure or rotate the signing secret. Claude can _trigger_ and _observe_ integrations conversationally, but configuration changes are deliberate human actions in the Payload admin.

This asymmetry is intentional and is why `trigger_sync` is admin-only too — manual triggering writes to an external system, even if it doesn't change configuration. The Sync now button and its endpoint apply the same rule, and the button does not render for a non-admin.

## Webhook details

| Field | Behaviour |
|---|---|
| `targetUrl` | Required, must be `https://`. Validated at write time. |
| `signingSecret` | Required, ≥ 32 characters. Used as the HMAC-SHA256 key. |
| `eventFilter` | Optional list of event names; empty list = deliver all subscribed events. |
| `includeFullPayload` | If false (default), only `id`, `slug`, and `*Id` fields go in the body. |
| `timeoutSeconds` | Per-request timeout. Default 10. |

Outbound headers:

```
content-type: application/json
x-throughline-event: <event name>
x-throughline-signature: sha256=<hex digest>
x-throughline-timestamp: <epoch ms>
```

The HMAC is computed over the entire request body (a JSON-stringified envelope of `{ event, data, timestamp, instanceId }`). Receivers verify by recomputing with the shared secret and comparing in constant time.

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `inngest` | `Inngest` | required | Throws at validate if missing |
| `integrations` | `Integration[]` | `[]` | Appended to the built-in webhook integration |
| `collectionSlug` | `string` | `'integrations'` | |
| `mcpTools` | `McpToolCollector` | — | The host's collector. Without it these five tools are unreachable. This plugin serves no HTTP endpoint of its own and takes no `routePrefix` |
| `enabled` | `boolean` | `true` | Set to false to no-op |
| `logger` | `Logger` | `defaultLogger` | |

## Related packages

- `@forumone/throughline-core` — required peer; provides audit log and MCP handler
- `@forumone/throughline-publishing`, `@forumone/throughline-approvals`, `@forumone/throughline-audit` — emit events this package's webhook can deliver

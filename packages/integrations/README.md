# @forumone/throughline-integrations

Plugin architecture for connecting Throughline-powered Payload sites to external systems. Ships the `Integration` contract every future integration follows, the registry, the per-instance configuration collection, five MCP tools, and a generic outbound webhook integration as the reference implementation.

## What this package provides

- **`Integration` contract** — id, name, description, configFields, validateConfig, subscribes, createFunctions, mcpTools (optional), healthcheck. Every Salesforce / Mailchimp / Slack / etc. integration uses this exact shape.
- **`IntegrationRegistry`** — process-local, per-plugin-init store keyed by integration id. Rejects duplicates synchronously.
- **Integrations collection** — `name`, `integrationType`, `enabled`, `config` (json), and read-only `lastSyncAt` / `lastSyncStatus` / `lastError`. Admin-only writes; admin/editor reads.
- **Five MCP tools** at `/api/integrations/mcp`:

| Tool | Use it for | Access |
|---|---|---|
| `list_integrations` | "What integrations are configured?" / "Which are healthy?" | admin / editor |
| `get_integration_status` | One instance's last-sync info | admin / editor |
| `trigger_sync` | Manual delivery to verify connectivity after a config change | admin only |
| `test_integration` | Run the integration's healthcheck (no event emitted) | admin / editor |
| `list_integration_types` | "What kinds of integrations are supported here?" | any caller |

- **Webhook integration** — generic outbound HTTPS POST with HMAC-SHA256 signing, configurable event filter, retries (5x), timeout, and a HEAD-based healthcheck. RFC 4231 known-answer test vectors pin the wire format so refactoring can never silently break receivers.

## Why this is separate from the other server packages

The other server packages do one job well. This is a **framework within the framework**: a contract for integration modules plus tooling to register, configure, observe, and trigger them. Every real client engagement needs integrations; building them ad-hoc produces unmaintainable tangle. This package keeps the surface area bounded as the integration count grows.

## Installation

```bash
pnpm add @forumone/throughline-integrations
```

Peers: `payload@^3.0.0`, `inngest@^4.0.0`. Required runtime peer: `@forumone/throughline-core` (audit log).

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

This asymmetry is intentional and is why `trigger_sync` is admin-only too — manual triggering writes to an external system, even if it doesn't change configuration.

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
| `routePrefix` | `string` | `'/integrations'` | Payload prepends `/api`, so MCP lands at `/api/integrations/mcp` |
| `enabled` | `boolean` | `true` | Set to false to no-op |
| `logger` | `Logger` | `defaultLogger` | |

## Related packages

- `@forumone/throughline-core` — required peer; provides audit log and MCP handler
- `@forumone/throughline-publishing`, `@forumone/throughline-approvals`, `@forumone/throughline-audit` — emit events this package's webhook can deliver

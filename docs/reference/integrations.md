# @forumone/throughline-integrations

Plugin architecture for connecting Throughline-powered Payload sites to external systems (CRM, marketing automation, analytics). Ships the `Integration` contract, a registry, the `integrations` Payload collection, MCP tools for managing instances, and a generic outbound-webhook integration as the first concrete example.

## Install

```bash
pnpm add @forumone/throughline-integrations
```

Peer dependencies: `payload@^3.0.0`, `inngest@^4.0.0`. Depends on `@forumone/throughline-core`.

## Public API

```typescript
import {
  integrationsPlugin,
  getIntegrationRegistry,
  getIntegrationContext,
  IntegrationRegistry,
  webhookIntegration,
  WEBHOOK_INTEGRATION_ID,
  createListIntegrationsTool,
  createGetIntegrationStatusTool,
  createTriggerSyncTool,
  createTestIntegrationTool,
  createListIntegrationTypesTool,
  DEFAULT_INTEGRATIONS_SLUG,
} from '@forumone/throughline-integrations'

import type {
  Integration,
  IntegrationCategory,
  IntegrationContext,
  IntegrationAuditEvent,
  IntegrationConfigValidation,
  IntegrationHealth,
  IntegrationInstance,
  IntegrationInstanceLoaded,
  IntegrationSyncStatus,
  IntegrationsPluginOptions,
  WebhookConfig,
} from '@forumone/throughline-integrations'
```

## `integrationsPlugin(options)`

```typescript
integrationsPlugin({
  inngest,                                   // required
  integrations: Integration[],               // required; the registered set
  collectionSlug?: string,                   // default 'integrations'
  mcpTools?: McpToolCollector,                // hand it the host's collector, or
                                              // its five tools reach nobody
})
```

The plugin:

- Creates the `integrations` collection (one row per configured instance)
- Registers `integrations` in the capability registry
- Exposes the `IntegrationRegistry` and `IntegrationContext` via Symbol-keyed slots on the Payload instance
- Adds its five MCP tools to the collector, for the host's `/api/mcp`

It serves no HTTP endpoint of its own, which is why it takes no `routePrefix` —
passing one is a compile error rather than a setting that does nothing.

## The `Integration` interface

```typescript
interface Integration<Config = unknown> {
  slug: string                               // 'webhook', 'hubspot', 'segment'
  category: IntegrationCategory              // 'crm' | 'marketing' | 'analytics' | 'other'
  configSchema: ZodSchema<Config>
  configFields: Field[]                      // Payload admin fields
  healthcheck: (config: Config) => Promise<IntegrationHealth>
  createFunctions: (ctx: IntegrationContext) => InngestFunction[]
  mcpTools?: McpToolDefinition[]             // optional; tools the integration adds
}

interface IntegrationContext {
  payload: Payload
  inngest: InngestClient
  logger: Logger
}
```

See [Adding an integration](../guides/adding-an-integration.md) for a worked example.

## The webhook integration

Bundled in this package as the canonical example:

```typescript
import { webhookIntegration } from '@forumone/throughline-integrations'

integrationsPlugin({
  inngest,
  integrations: [webhookIntegration],
})
```

`webhookIntegration` provides:

- Config schema: `{ url, secret, events?, headers?, timeoutMs? }`
- HMAC-SHA256 signature on every outbound request (`X-Throughline-Signature` header)
- Healthcheck that POSTs `{ type: 'health-check' }` to the configured URL
- An Inngest function that subscribes to `content/page.*` and forwards events to the configured URL

The wire format and signing are documented in `packages/integrations/src/integrations/webhook/README.md` (in core).

## MCP tools

| Tool | Required role | Purpose |
| --- | --- | --- |
| `list_integrations` | `admin`, `editor` | List configured instances + their current health |
| `list_integration_types` | `admin`, `editor` | List the registered Integrations available to configure |
| `get_integration_status` | `admin`, `editor` | One instance: config (redacted), recent runs, health |
| `test_integration` | `admin` | Run the integration's healthcheck on demand |
| `trigger_sync` | `admin` | Fire a `content/page.published`-shaped event for one document; useful for backfilling |

## `IntegrationRegistry`

Synchronous registry built at plugin init. Three operations:

```typescript
const registry = getIntegrationRegistry(payload)
registry?.list()                             // all registered Integration values
registry?.get(slug)                          // one by slug
registry?.has(slug)                          // boolean
```

The registry is per-process; not durable. Per-instance config lives in the `integrations` collection.

## `getIntegrationContext(payload)`

Returns the `IntegrationContext` (payload, inngest, logger) for use when wiring functions. Used in the Inngest endpoint of a generated app:

```typescript
import { getIntegrationRegistry, getIntegrationContext } from '@forumone/throughline-integrations'

const registry = getIntegrationRegistry(payload)
const ctx = getIntegrationContext(payload)
const fns = registry && ctx
  ? registry.list().flatMap((i) => i.createFunctions(ctx))
  : []

export const { GET, POST, PUT } = serve({ client: inngest, functions: [...frameworkFns, ...fns] })
```

The CLI scaffolder writes this wiring into the generated `apps/web/src/app/api/inngest/route.ts`.

## Events fired

| Event | When |
| --- | --- |
| `integration/<slug>.<action>` | Per-integration; the integration owns the namespace |
| `system/integration.health-check-failed` | An instance's healthcheck returns `ok: false` |
| `system/integration.error` | An integration's `step.run` exhausts retries |

## Capabilities registered

- `integrations` — the plugin is loaded
- `integration-registry` — the registry is available

## Common usage

```typescript
import { integrationsPlugin, webhookIntegration } from '@forumone/throughline-integrations'
import { hubspotIntegration } from '@your-scope/integration-hubspot'

integrationsPlugin({
  inngest,
  integrations: [
    webhookIntegration,
    hubspotIntegration,
  ],
}),
```

## Related

- Guide: [Adding an integration](../guides/adding-an-integration.md)
- Concept: [Event-driven workflows](../concepts/event-driven-workflows.md) — how integrations subscribe
- Reference: [@forumone/throughline-workflows](workflows.md) — the framework's own subscribers

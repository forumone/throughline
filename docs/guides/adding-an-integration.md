# Adding an integration

Goal: implement an `Integration` and register it with the Integrations plugin so Throughline can sync content to (or from) your CRM, marketing automation, analytics, or any other third-party system.

This guide replaces the older `docs/integrations-wiring.md`.

## What's an integration?

An `Integration` is a value implementing a small interface:

```typescript
import type { Integration, IntegrationContext } from '@forumone/throughline-integrations'

interface Integration<Config> {
  slug: string                                    // 'hubspot', 'salesforce', 'segment'
  category: 'crm' | 'marketing' | 'analytics' | 'other'
  configSchema: ZodSchema<Config>                 // user-supplied per-instance config
  configFields: Field[]                           // Payload admin fields for the config
  healthcheck: (config: Config) => Promise<HealthcheckResult>
  createFunctions: (ctx: IntegrationContext) => InngestFunction[]
  // Optional: register MCP tools the integration adds
  mcpTools?: McpToolDefinition[]
}
```

The plugin registers it once at boot. The Payload `integrations` collection holds per-instance configs (you can have multiple HubSpot accounts, for instance). Each instance's Inngest functions handle the actual work.

## Building one: the example

Imagine syncing every published page to a hypothetical "PageStore" SaaS.

### 1. Create a package

In your client project's monorepo:

```
packages/integration-pagestore/
├── src/
│   ├── index.ts          # exports the integration value
│   ├── config.ts         # schema + admin fields
│   ├── healthcheck.ts    # ping the API
│   └── functions.ts      # Inngest workers
├── package.json
└── tsconfig.json
```

Or write it inline in `apps/web/src/integrations/`. Up to you.

### 2. Write the config schema and fields

```typescript
// src/config.ts
import { z } from 'zod'
import type { Field } from 'payload'

export const PageStoreConfigSchema = z.object({
  apiKey: z.string().min(20),
  workspaceId: z.string().uuid(),
  syncMode: z.enum(['create-only', 'upsert']).default('upsert'),
})

export type PageStoreConfig = z.infer<typeof PageStoreConfigSchema>

export const pageStoreConfigFields: Field[] = [
  {
    name: 'apiKey',
    type: 'text',
    required: true,
    admin: { description: 'PageStore API key (Settings → API Keys)' },
  },
  {
    name: 'workspaceId',
    type: 'text',
    required: true,
    admin: { description: 'PageStore workspace UUID' },
  },
  {
    name: 'syncMode',
    type: 'select',
    options: ['create-only', 'upsert'],
    defaultValue: 'upsert',
  },
]
```

The config schema validates on save. The fields render in the Payload admin under the integration instance's edit page.

### 3. Implement the healthcheck

```typescript
// src/healthcheck.ts
import type { PageStoreConfig } from './config'

export async function pageStoreHealthcheck(config: PageStoreConfig) {
  try {
    const r = await fetch('https://api.pagestore.example/v1/ping', {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    })
    if (!r.ok) {
      return { ok: false, details: `Ping returned ${r.status}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, details: String(error) }
  }
}
```

The Workflows package's `createHealthcheckFunction` calls this on a cron and writes results to the audit log. See [Observability](../operations/observability.md).

### 4. Write the Inngest workers

```typescript
// src/functions.ts
import type { IntegrationContext } from '@forumone/throughline-integrations'
import type { PageStoreConfig } from './config'

export function createPageStoreFunctions(ctx: IntegrationContext) {
  return [
    ctx.inngest.createFunction(
      {
        id: 'pagestore-sync-published',
        // Concurrency is per-integration: avoid hammering PageStore on bursty publishes
        concurrency: { limit: 5 },
      },
      { event: 'content/page.published' },
      async ({ event, step }) => {
        // Fetch each enabled instance of the integration
        const instances = await step.run('fetch-instances', async () => {
          const result = await ctx.payload.find({
            collection: 'integrations',
            where: {
              integrationSlug: { equals: 'pagestore' },
              enabled: { equals: true },
            },
          })
          return result.docs as Array<{ id: string; config: PageStoreConfig }>
        })

        for (const instance of instances) {
          await step.run(`sync-${instance.id}`, async () => {
            const page = event.data.doc
            await fetch('https://api.pagestore.example/v1/pages', {
              method: instance.config.syncMode === 'create-only' ? 'POST' : 'PUT',
              headers: {
                Authorization: `Bearer ${instance.config.apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                workspace: instance.config.workspaceId,
                slug: page.slug,
                title: page.title,
                publishedAt: page.publishedAt,
              }),
            })
          })
        }
      },
    ),
  ]
}
```

Notice:

- `step.run('fetch-instances', ...)` — durable. If the function crashes mid-flight, fetch-instances has already checkpointed.
- One `step.run` per instance — failure of one doesn't poison the others.
- `concurrency: { limit: 5 }` — protects PageStore from concurrent floods.
- The function fires for every published page; subscribers filter their own work, the framework doesn't gate.

### 5. Compose the integration value

```typescript
// src/index.ts
import type { Integration } from '@forumone/throughline-integrations'
import { PageStoreConfigSchema, pageStoreConfigFields, type PageStoreConfig } from './config'
import { pageStoreHealthcheck } from './healthcheck'
import { createPageStoreFunctions } from './functions'

export const pageStoreIntegration: Integration<PageStoreConfig> = {
  slug: 'pagestore',
  category: 'crm',
  configSchema: PageStoreConfigSchema,
  configFields: pageStoreConfigFields,
  healthcheck: pageStoreHealthcheck,
  createFunctions: createPageStoreFunctions,
}
```

### 6. Register it

In `apps/web/src/payload.config.ts`:

```typescript
import { integrationsPlugin } from '@forumone/throughline-integrations'
import { pageStoreIntegration } from '@your-scope/integration-pagestore'

integrationsPlugin({
  inngest,
  integrations: [
    webhookIntegration,        // ships in @forumone/throughline-integrations
    pageStoreIntegration,      // your new one
  ],
}),
```

### 7. Wire the functions to your Inngest endpoint

In `apps/web/src/app/api/inngest/route.ts` — this is already done by the scaffolder, so a fresh project doesn't need to edit this:

```typescript
const integrationRegistry = getIntegrationRegistry(payload)
const integrationContext = getIntegrationContext(payload)
const integrationFunctions =
  integrationRegistry && integrationContext
    ? integrationRegistry
        .list()
        .flatMap((integration) => integration.createFunctions(integrationContext))
    : []

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // ...framework functions
    ...integrationFunctions,
  ],
})
```

The scaffold pulls integration functions in automatically. New integrations don't require Inngest endpoint edits.

### 8. Configure an instance

In the Payload admin, open the **Integrations** collection. Create a new entry, choose `pagestore` from the integration slug, fill in the config fields, save. The plugin validates the config against your schema and writes the instance.

### 9. Test it

Publish a page in your dev environment. In the Inngest dashboard (http://localhost:8288), you'll see `pagestore-sync-published` fire, with its `fetch-instances` and `sync-<id>` steps. Failures land in the dashboard with the full error.

```
List recent integration events.
```

Claude calls `get_integration_status` on the Integrations MCP. You'll see your sync, its health, and any recent failures.

## When something fails

- **Healthcheck reports `ok: false`** — the cron writes a `system/integration.health-check-failed` audit event. The workflow continues firing on `content/page.published`, and individual sync attempts will likely also fail. Either fix the upstream or disable the instance in the admin.
- **A sync `step.run` throws** — Inngest retries with exponential backoff. After max retries, the run lands in the dead-letter section of the dashboard. You can replay manually after fixing the cause.
- **The integration package itself errors at load time** — `payload generate:types` and `pnpm dev` fail loudly. The `requireCapability` checks in the plugin catch most "you forgot something" cases.

## Security considerations

- API keys live in the `integrations` collection's `config` field, encrypted-at-rest only by your database. If your DB is shared with less-trusted services, consider moving keys to env vars and referring to them by name in the config.
- The integration's `createFunctions` runs in the same process as Payload. A compromised integration package has full access. Vet third-party integration packages like you'd vet npm dependencies.
- Outbound traffic from your integrations is logged (when you implement audit calls in `step.run`) but not gated. If your security model needs egress filtering, run the host on a VPC with explicit allowlists.

## Where to look in code

- `packages/integrations/src/types.ts` — full type definitions
- `packages/integrations/src/integrations/webhook/*.ts` — the bundled webhook integration as a worked example
- `packages/integrations/src/registry.ts` — how the registry resolves slugs

# Adding an integration

Goal: implement an `Integration` and register it with the Integrations plugin so Throughline can sync content to (or from) your CRM, marketing automation, analytics, or any other third-party system.

## What's an integration?

An `Integration` is a value implementing a small interface, from `@forumone/throughline/integrations`:

```typescript
interface Integration<Config> {
  id: string                       // 'hubspot', 'salesforce', 'segment'; stored on each instance
  name: string                     // shown in the admin and by list_integration_types
  description: string
  category: 'crm' | 'marketing' | 'analytics' | 'webhook' | 'storage' | …
  configFields: Field[]            // Payload admin fields for each instance's config
  validateConfig: (config: Config) => Promise<{ ok: true } | { ok: false; reason: string }>
  subscribes: Array<{ event: string; purpose: string }> // documentation only
  createJobs?: (getContext: (job: JobContext) => IntegrationContext) => Job[]
  createFunctions?: (ctx: IntegrationContext) => InngestFunction[] // 0.x; optional
  healthcheck?: (config: Config) => Promise<{ ok: boolean; details?: string }>
  mcpTools?: (ctx: IntegrationContext) => McpToolDefinition[]
}
```

The plugin registers it once at boot. The Payload `integrations` collection holds per-instance configs (you can have multiple HubSpot accounts, for instance). The integration's jobs do the actual work, for every enabled instance.

**`createJobs` is the one that runs.** `throughline()` runs integrations through the site's jobs adapter, on Inngest or on Payload Jobs, and refuses an integration without `createJobs`. `createFunctions` is the 0.x shape, optional and not called by `throughline()`. Keep it only if a 0.x site still registers your integration by hand, and then derive it from `createJobs` in one line, as the bundled webhook integration does.

## Building one: the example

Imagine syncing every published page to a hypothetical "PageStore" SaaS.

### 1. Create a package

In your client project's monorepo:

```
packages/integration-pagestore/
├── src/
│   ├── index.ts          # exports the integration value
│   ├── config.ts         # admin fields
│   ├── healthcheck.ts    # ping the API
│   └── jobs.ts           # the work
├── package.json
└── tsconfig.json
```

Or write it inline in `apps/web/src/integrations/`. Up to you.

### 2. Write the config fields

```typescript
// src/config.ts
import type { Field } from 'payload'

export interface PageStoreConfig {
  apiKey: string
  workspaceId: string
  syncMode: 'create-only' | 'upsert'
}

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

The fields render in the Payload admin under the instance's `config` group. `validateConfig`, in step 5, runs in the collection's `beforeChange` hook, so a bad config is refused on save, inline, rather than at sync time.

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

The `test_integration` MCP tool calls it on demand. See [Observability](../operations/observability.md).

### 4. Write the jobs

```typescript
// src/jobs.ts
import { defineJob, type Job, type JobContext } from '@forumone/throughline/jobs'
import type { IntegrationContext } from '@forumone/throughline/integrations'
import type { PageStoreConfig } from './config'

export function createPageStoreJobs(getContext: (job: JobContext) => IntegrationContext): Job[] {
  const syncPublished = defineJob(
    { id: 'pagestore-sync-published', retries: 5, on: { event: 'content/page.published' } },
    async (job) => {
      const { event, step } = job
      const ctx = getContext(job)
      // Every enabled instance of this integration
      const instances = await step.run('fetch-instances', () =>
        ctx.loadInstances<PageStoreConfig>('pagestore'),
      )

      for (const instance of instances) {
        await step.run(`sync-${instance.id}`, async () => {
          const page = (event.data as { doc: { slug: string; title: string } }).doc
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
            }),
          })
        })
      }
    },
  )
  return [syncPublished]
}
```

Notice:

- `step.run('fetch-instances', ...)` — durable. If the job crashes mid-flight, fetch-instances has already checkpointed. That holds on both runners.
- One `step.run` per instance — failure of one doesn't poison the others.
- `getContext(job)` inside the handler, not outside: the jobs are built while the config is, before the context exists.
- The job fires for every published page; subscribers filter their own work, the framework doesn't gate.
- The id is the function id. Changing it later orphans a run in flight, so pick it once.

### Reporting how the run went

The example above leaves out the instance's status fields. A real job reports each run with `ctx.updateStatus`, and the admin shows the result as Last Sync Status and Last Error:

```typescript
import { statusFromProblems } from '@forumone/throughline/integrations'

// One line for each record this run left undone.
const problems: string[] = []
// ... push `page ${slug}: ${reason}` as records fail ...

await ctx.updateStatus(instance.id, ...statusFromProblems(problems))
```

`statusFromProblems` returns `success` when the list is empty and `partial` with a capped summary otherwise. For a run that failed outright, pass the reason yourself: `ctx.updateStatus(instance.id, 'failed', message)`. A `partial` or `failed` status without a message does not typecheck, and only `success` clears Last Error.

### 5. Compose the integration value

```typescript
// src/index.ts
import type { Integration } from '@forumone/throughline/integrations'
import { inngestJobs } from '@forumone/throughline/jobs/inngest'
import { pageStoreConfigFields, type PageStoreConfig } from './config'
import { pageStoreHealthcheck } from './healthcheck'
import { createPageStoreJobs } from './jobs'

export const pageStoreIntegration: Integration<PageStoreConfig> = {
  id: 'pagestore',
  name: 'PageStore',
  description: 'Mirror every published page into a PageStore workspace.',
  category: 'crm',
  configFields: pageStoreConfigFields,
  async validateConfig(config) {
    if (!config?.workspaceId) return { ok: false, reason: 'workspaceId is required' }
    return { ok: true }
  },
  subscribes: [{ event: 'content/page.published', purpose: 'Mirror the page into PageStore' }],
  createJobs: createPageStoreJobs,
  createFunctions: (ctx) =>
    inngestJobs(ctx.inngest, ctx.onFailure ? { onFailure: ctx.onFailure } : {}).functions(
      createPageStoreJobs(() => ctx),
    ),
  healthcheck: pageStoreHealthcheck,
}
```

### 6. Register it

In `apps/web/src/payload.config.ts`, under `throughline()`'s `integrations` key:

```typescript
import { pageStoreIntegration } from '@your-scope/integration-pagestore'

export const suite = throughline({
  // …
  integrations: { integrations: [pageStoreIntegration] },
})
```

The bundled webhook integration is always registered; list only your own. A duplicate id throws at init.

### 7. Nothing to wire

`suite.jobs` now holds `pagestore-sync-published`. On Inngest, the scaffold's `apps/web/src/app/api/inngest/route.ts` already serves `suite.jobs`; on Payload Jobs, `suite.plugin` registers it. A new integration needs no endpoint edit.

### 8. Configure an instance

In the Payload admin, open the **Integrations** collection. Create a new entry, choose `pagestore` from the integration slug, fill in the config fields, save. The plugin validates the config against your schema and writes the instance.

### 9. Test it

Publish a page in your dev environment. In the Inngest dashboard (http://localhost:8288), or Payload's jobs on Payload Jobs, you'll see `pagestore-sync-published` fire, with its `fetch-instances` and `sync-<id>` steps. Failures land in the dashboard with the full error.

```
List recent integration events.
```

Claude calls `get_integration_status`. You'll see your sync, its health, and any recent failures.

## When something fails

- **Healthcheck reports `ok: false`** — `test_integration` says so, with the details. Nothing stops the job: it keeps firing on `content/page.published`, and individual sync attempts will likely also fail. Either fix the upstream or disable the instance in the admin. To check it on a schedule, add a check to `throughline()`'s `healthcheck.checks`, whose failures are recorded in `job-failures`.
- **A sync `step.run` throws** — the runner retries with backoff, up to the job's `retries`. After the last one, the terminal-failure handler writes a `job-failures` row and posts to `ERROR_WEBHOOK_URL`; on Inngest the run is also in the dashboard to replay after fixing the cause.
- **The integration package itself errors at load time** — `payload generate:types` and `pnpm dev` fail loudly. `throughline()` refuses an integration without `createJobs`, naming it.

## Security considerations

- API keys live in the `integrations` collection's `config` field, encrypted-at-rest only by your database. If your DB is shared with less-trusted services, consider moving keys to env vars and referring to them by name in the config.
- The integration's jobs run in the same process as Payload. A compromised integration package has full access. Vet third-party integration packages like you'd vet npm dependencies.
- Outbound traffic from your integrations is logged (when you implement audit calls in `step.run`) but not gated. If your security model needs egress filtering, run the host on a VPC with explicit allowlists.

## Where to look in code

- `packages/throughline/src/integrations/types.ts` — full type definitions
- `packages/throughline/src/integrations/integrations/webhook/*.ts` — the bundled webhook integration as a worked example
- `packages/throughline/src/integrations/registry.ts` — how the registry resolves ids
- [Integrations reference](../reference/throughline/integrations.md)

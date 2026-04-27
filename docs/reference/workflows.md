# @forumone/throughline-workflows

Inngest function factories for the framework. Five functions: revalidate-on-publish, execute-scheduled-publishes, expire-stale-approvals, audit-event-echo, and healthcheck. Each is a factory you call from your Inngest endpoint and add to the `functions` array.

This package is *not* a Payload plugin. It's a library of function factories. Wire them in your `apps/web/src/app/api/inngest/route.ts`.

## Install

```bash
pnpm add @forumone/throughline-workflows
```

Peer dependencies: `inngest@^4.0.0`, `payload@^3.0.0`. Depends on `@forumone/throughline-core`.

## Public API

```typescript
import {
  createRevalidateOnPublishFunction,
  createExecuteScheduledPublishesFunction,
  createExpireStaleApprovalsFunction,
  createAuditEventEchoFunction,
  createHealthcheckFunction,
  createPayloadReachableCheck,
  createManifestReachableCheck,
} from '@forumone/throughline-workflows'

import type {
  BaseWorkflowOptions,
  RevalidateFn,
  RevalidatePathsInput,
  RevalidateOnPublishOptions,
  ScheduledCollectionConfig,
  ExecuteScheduledPublishesOptions,
  ExpireStaleApprovalsOptions,
  AuditEchoEvent,
  AuditEchoHandler,
  AuditEventEchoOptions,
  HealthcheckDefinition,
  HealthcheckOptions,
  HealthcheckResult,
} from '@forumone/throughline-workflows'
```

## Functions

### `createRevalidateOnPublishFunction(options)`

Subscribes to `content/page.published` and `content/page.unpublished`. Calls `revalidatePath(...)` for each affected document so Next.js rebuilds the relevant pages.

```typescript
createRevalidateOnPublishFunction({
  inngest,
  payload,                                   // for cross-document lookups
  revalidate?: (paths: string[]) => Promise<void>,    // default: imports from 'next/cache'
  buildPaths?: (event) => string[] | undefined,        // override path computation per collection
})
```

Default path builders:

- `pages` collection: `home` slug → `/`; otherwise `/${slug}`
- `posts` collection: `/blog/${slug}`

Override via `buildPaths`:

```typescript
createRevalidateOnPublishFunction({
  inngest,
  payload,
  buildPaths: (event) => {
    if (event.data.collection === 'programs') {
      return [`/programs/${event.data.doc.slug}`, '/programs']
    }
    return undefined  // fall back to default
  },
})
```

In non-Next.js environments, override `revalidate` with your own cache-flushing function.

### `createExecuteScheduledPublishesFunction(options)`

Cron-driven. Looks for documents with `scheduledPublishAt <= now` across configured collections and calls the Publishing MCP's `publish` tool over HTTP for each.

```typescript
createExecuteScheduledPublishesFunction({
  inngest,
  payload,
  collections: ScheduledCollectionConfig[],     // [{ slug: 'pages' }, ...]
  publishingServerUrl: string,                  // process.env.NEXT_PUBLIC_SERVER_URL!
  systemApiKey: string,                         // process.env.PUBLISHING_SYSTEM_API_KEY!
  cron?: string,                                // default '*/5 * * * *' (every 5 min)
})
```

The function calls Publishing MCP rather than `payload.update` because publishing must go through the trust boundary's seven-stage pipeline. A scheduled publish that fails its policy gates fails just like an interactive publish.

### `createExpireStaleApprovalsFunction(options)`

Daily cron. Looks at the approvals collection for `status: 'pending'` rows older than `expireAfter`, fires `approval/expired` for each, and updates the row status. The Email plugin's `notify-approval-expired` worker subscribes.

```typescript
createExpireStaleApprovalsFunction({
  inngest,
  payload,
  cron?: string,                                // default '0 4 * * *'
  collectionSlug?: string,                      // default 'approvals'
  expireAfter?: string,                         // default '14d'
})
```

### `createAuditEventEchoFunction(options)`

Subscribes to `approval/*` events and writes corresponding rows to the audit log. The audit-log row captures the approval lifecycle (requested, granted, declined, etc.) without requiring the Approvals plugin to write directly to audit.

```typescript
createAuditEventEchoFunction({
  inngest,
})
```

### `createHealthcheckFunction(options)`

Cron-driven. Runs a list of healthchecks; writes per-check results to the audit log; fires `system/healthcheck.completed` with the aggregate.

```typescript
createHealthcheckFunction({
  inngest,
  payload,
  cron?: string,                                // default '*/15 * * * *'
  checks: HealthcheckDefinition[],
})

interface HealthcheckDefinition {
  name: string
  run: () => Promise<HealthcheckResult>
}

interface HealthcheckResult {
  ok: boolean
  details?: string
  metadata?: Record<string, unknown>
}
```

The package ships two helpers:

- `createPayloadReachableCheck({ payload })` — confirms Payload is responsive
- `createManifestReachableCheck({ url })` — fetches the URL, confirms 2xx

Add your own checks (database connectivity, Redis, third-party services) by writing values matching `HealthcheckDefinition`.

## Common usage

In a generated app's Inngest endpoint:

```typescript
import { serve } from 'inngest/next'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createInngestClient } from '@forumone/throughline-core'
import {
  createAuditEventEchoFunction,
  createExecuteScheduledPublishesFunction,
  createExpireStaleApprovalsFunction,
  createHealthcheckFunction,
  createPayloadReachableCheck,
  createRevalidateOnPublishFunction,
} from '@forumone/throughline-workflows'
import { getEmailFunctions } from '@forumone/throughline-email'
import { getFormsFunctions } from '@forumone/throughline-forms'
import { getIntegrationContext, getIntegrationRegistry } from '@forumone/throughline-integrations'

const inngest = createInngestClient({ id: 'my-site' })
const payload = await getPayload({ config })

const integrationRegistry = getIntegrationRegistry(payload)
const integrationContext = getIntegrationContext(payload)
const integrationFunctions =
  integrationRegistry && integrationContext
    ? integrationRegistry.list().flatMap((i) => i.createFunctions(integrationContext))
    : []

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    createRevalidateOnPublishFunction({ inngest, payload }),
    createExecuteScheduledPublishesFunction({
      inngest, payload,
      collections: [{ slug: 'pages' }],
      publishingServerUrl: process.env.NEXT_PUBLIC_SERVER_URL!,
      systemApiKey: process.env.PUBLISHING_SYSTEM_API_KEY!,
    }),
    createExpireStaleApprovalsFunction({ inngest, payload }),
    createAuditEventEchoFunction({ inngest }),
    createHealthcheckFunction({
      inngest, payload,
      checks: [createPayloadReachableCheck({ payload })],
    }),
    ...(getEmailFunctions(payload) ?? []),
    ...(getFormsFunctions(payload) ?? []),
    ...integrationFunctions,
  ],
})
```

The CLI scaffolder writes this verbatim. You usually only edit the `collections` for `createExecuteScheduledPublishesFunction` and the `checks` for `createHealthcheckFunction`.

## Why factories, not a plugin

The functions need a single `inngest` client and a single `payload` instance, both of which are constructed in `apps/web/src/app/api/inngest/route.ts`. A plugin couldn't hand those over cleanly. Factories let consumers pass them explicitly.

The functions also need to live in the consumer's `serve({ functions: [...] })` array — Inngest serves a fixed list, not a registry. Factories produce values that fit that array directly.

## Related

- Concept: [Event-driven workflows](../concepts/event-driven-workflows.md)
- Operations: [Observability](../operations/observability.md) — healthcheck patterns
- Reference: [@forumone/throughline-publishing](publishing.md), [@forumone/throughline-approvals](approvals.md), [@forumone/throughline-integrations](integrations.md)

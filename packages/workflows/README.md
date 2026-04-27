# @forumone/throughline-workflows

Composable Inngest function factories for the Throughline framework. Client apps import the factories they need and merge the functions into their Inngest endpoint.

This package has **no Payload plugin** — it exports factories only. Workflows subscribe to events the server packages emit; they don't modify Payload configuration.

## What this package provides

| Factory | What it does |
|---|---|
| `createRevalidateOnPublishFunction` | Invalidates Next.js caches for the page, listings, and sitemap when content publishes |
| `createExecuteScheduledPublishesFunction` | Cron-driven scheduled publish executor that calls through the Publishing Server's MCP |
| `createExpireStaleApprovalsFunction` | Daily cron that flips pending approvals past `expiresAt` to `expired` and fires an `approval/expired` event |
| `createAuditEventEchoFunction` | Fan-out point: turns `audit/event.recorded` into `notification/send-approval-*` events plus custom handlers |
| `createHealthcheckFunction` | Periodic health monitoring with configurable checks |

Plus two reusable check helpers used with the healthcheck factory:

- `createPayloadReachableCheck(slug?)` — verifies Payload can `find` from a collection
- `createManifestReachableCheck(url)` — verifies an HTTPS manifest URL responds 2xx

## Installation

```bash
pnpm add @forumone/throughline-workflows
```

Peers: `payload@^3.0.0`, `inngest@^4.0.0`. `next` is an **optional** peer — install it only if you use `createRevalidateOnPublishFunction` with the default revalidator.

## Usage

In your Next.js app's Inngest endpoint:

```typescript
// src/app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { inngest } from '@/lib/inngest'
import {
  createRevalidateOnPublishFunction,
  createExecuteScheduledPublishesFunction,
  createExpireStaleApprovalsFunction,
  createAuditEventEchoFunction,
  createHealthcheckFunction,
  createPayloadReachableCheck,
} from '@forumone/throughline-workflows'

const payload = await getPayload({ config })

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    createRevalidateOnPublishFunction({ inngest, payload }),
    createExecuteScheduledPublishesFunction({
      inngest,
      payload,
      collections: [{ slug: 'pages' }, { slug: 'posts' }],
      publishingServerUrl: process.env.NEXT_PUBLIC_SERVER_URL!,
      // PUBLISHING_SYSTEM_API_KEY env var carries the api key
    }),
    createExpireStaleApprovalsFunction({ inngest, payload }),
    createAuditEventEchoFunction({ inngest }),
    createHealthcheckFunction({
      inngest,
      payload,
      checks: [createPayloadReachableCheck()],
    }),
  ],
})
```

## Why this lives outside the server packages

By C10, every server package fires Inngest events when consequential things happen. This package is the **subscriber side** — the functions that react to those events. Splitting the subscriber side from the publisher packages keeps the server packages from accumulating "and also runs this revalidation logic" appendices, and it lets clients pick which workflows they want without dragging in everything.

The factories-only shape (no Payload plugin) is the same reasoning. A workflow that wants to revalidate Next.js pages doesn't need to register a Payload collection. A scheduled-publish executor doesn't need a Payload hook. They're cron / event handlers that happen to read from Payload.

## Non-Next.js frontends

The default `revalidate` function dynamically imports `next/cache` and is a no-op anywhere `revalidatePath` / `revalidateTag` aren't available. For other frameworks supply your own:

```typescript
createRevalidateOnPublishFunction({
  inngest,
  payload,
  revalidate: async ({ path, tags }) => {
    if (path) await myCdn.purge(path)
    for (const tag of tags) await myCdn.purgeTag(tag)
  },
})
```

`next` is declared as an optional peer (`peerDependenciesMeta.next.optional = true`) so non-Next consumers don't see a missing-peer warning.

## Why scheduled publishes call through the MCP

`createExecuteScheduledPublishesFunction` calls `POST /api/publishing/mcp` with a Bearer token rather than calling `payload.update` directly. That means scheduled publishes go through the same composition / accessibility / approval pipeline as Claude-initiated publishes — a composition error in a scheduled publish gets the same treatment as one caught interactively.

A composition error fails the publish loudly (audit log + `lastError`) instead of silently writing through.

## Customizing audit fan-out

The audit echo function wires the approval workflow by default. Add custom handlers for any other action:

```typescript
createAuditEventEchoFunction({
  inngest,
  handlers: [
    {
      match: (e) => e.action === 'integration.failed',
      handle: async (e) => {
        await inngest.send({
          name: 'notification/send-alert',
          data: { severity: 'error', summary: 'Integration failure', ...e.data },
        })
      },
    },
  ],
})
```

Each handler runs in its own `step.run`, so failures isolate.

## Options reference

Every factory takes a typed options object. See `src/types.ts` for the full surface — defaults documented there:

- `RevalidateOnPublishOptions` — `revalidate?`, `urlBuilders?`, `collectionTags?`, `id?`
- `ExecuteScheduledPublishesOptions` — `collections[]`, `publishingServerUrl`, `publishingApiKey?` (env fallback), `schedule?` (default `*/5 * * * *`), `id?`
- `ExpireStaleApprovalsOptions` — `collectionSlug?` (default `approvals`), `schedule?` (default `0 2 * * *`), `id?`
- `AuditEventEchoOptions` — `handlers?`, `id?`
- `HealthcheckOptions` — `checks[]`, `schedule?` (default `*/15 * * * *`), `onFailure?`, `id?`

## Related packages

- `@forumone/throughline-core` — required peer; provides the audit writer the approval-expiration cron uses
- `@forumone/throughline-publishing` — emits the publishing events the revalidation cron subscribes to
- `@forumone/throughline-approvals` — owns the approvals collection the expiration cron reads
- `@forumone/throughline-email` (C11) — will subscribe to `notification/send-approval-*`

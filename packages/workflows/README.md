# @forumone/throughline-workflows

Composable Inngest function factories for the Throughline framework. Client apps import the factories they need and merge the functions into their Inngest endpoint.

This package has **no Payload plugin** — it exports factories only. Workflows subscribe to events the server packages emit; they don't modify Payload configuration.

## What this package provides

| Factory | What it does |
|---|---|
| `createRevalidateOnPublishFunction` | Invalidates Next.js caches for the page, listings, and sitemap when content publishes |
| `createPublishAtScheduledTimeFunction` | Publishes a document at its scheduled time by sleeping until then, woken by `content/page.scheduled` |
| `createExecuteScheduledPublishesFunction` | Cron that publishes any document past its scheduled time — the backstop for the one above, or a poller on its own |
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

## Scheduled publishing: sleep, don't poll

`createPublishAtScheduledTimeFunction` is woken by `content/page.scheduled` — which
the publishing plugin sends whenever a document's scheduled time changes — sleeps
until that time, re-reads the document, and publishes it only if the document still
carries that exact time. The document is the source of truth and the event is a
wake-up call, so a reschedule, a cancellation, or a publish or unpublish in the
meantime needs no cancellation event: the old run wakes, finds the time changed, and
ends.

It publishes on the minute and costs a few steps per schedule. The poller costs two
executions per tick whether or not anything is due — at `*/15` that is 5,760 a month
to find, almost always, nothing.

A schedule more than six days out is carried in hops: the run sleeps six days,
re-sends the event and ends, so no single sleep passes the seven-day cap on
Inngest's free plan and no run approaches its thirty-day limit. Set `maxSleepMs` on
a paid plan if you prefer fewer hops.

Run the poller alongside it as a backstop for an event that never arrived, on a slow
schedule and with `overdueByMs`, so the two never reach a just-due document in the
same moment:

```ts
createPublishAtScheduledTimeFunction({ inngest, payload, collections, publish }),
createExecuteScheduledPublishesFunction({
  inngest,
  payload,
  collections,
  publish,
  schedule: '17 3 * * *',
  overdueByMs: 60 * 60 * 1000,
}),
```

Both read the document's **latest version** (`draft: true`). A schedule is written
by a draft save, and Payload writes a draft save to the versions table only, so the
main row never carries it — and reading the versions is also what lets a revision
of a live document be scheduled.

## Why scheduled publishes go through the pipeline

`createExecuteScheduledPublishesFunction` never writes to Payload. It finds what is
due and calls the `publish` callback you give it, which must be wired to the
publishing service — so a scheduled publish runs the same composition /
accessibility / approval pipeline as an interactive one. A composition error fails
it loudly (audit log + `lastError`) instead of silently writing through, and a
`payload.update` here would skip every gate.

```ts
import { getPublishingService } from '@forumone/throughline-publishing'

publish: async ({ collection, id, reasoning }) => {
  const outcome = await getPublishingService(payload).publish({
    collection,
    id,
    actor: { apiKeyName: 'scheduled-publish', channel: 'mcp' },
    meta: { reasoning },
  })
  return { published: outcome.published, reason: outcome.reason }
}
```

Injected rather than built in because this package depends on `core` alone, and the
service lives in the publishing package.

It used to `fetch` `POST /api/publishing/mcp` with a bearer key from
`PUBLISHING_SYSTEM_API_KEY`. That endpoint is gone — one `/api/mcp` replaced the six
per-server ones — and the self-call was the wrong shape regardless: a function
invocation per document, a base URL and a key that both had to be right, and a 401
rather than a publish if the deployment URL sat behind access protection. Neither
option exists any more; wire `publish`.

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
- `PublishAtScheduledTimeOptions` — `collections[]`, `publish`, `maxSleepMs?` (default six days), `id?`
- `ExecuteScheduledPublishesOptions` — `collections[]`, `publish`, `schedule?` (default `*/5 * * * *`), `overdueByMs?` (default 0), `id?`
- `ExpireStaleApprovalsOptions` — `collectionSlug?` (default `approvals`), `schedule?` (default `0 2 * * *`), `id?`
- `AuditEventEchoOptions` — `handlers?`, `id?`
- `HealthcheckOptions` — `checks[]`, `schedule?` (default `*/15 * * * *`), `onFailure?`, `id?`

## Related packages

- `@forumone/throughline-core` — required peer; provides the audit writer the approval-expiration cron uses
- `@forumone/throughline-publishing` — emits the publishing events the revalidation cron subscribes to
- `@forumone/throughline-approvals` — owns the approvals collection the expiration cron reads
- `@forumone/throughline-email` (C11) — will subscribe to `notification/send-approval-*`

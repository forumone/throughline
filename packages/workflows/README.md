# @forumone/throughline-workflows

Composable Inngest function factories for the Throughline framework, and the Payload hooks that keep a Next cache honest. Client apps import the factories they need and merge the functions into their Inngest endpoint.

This package has **no Payload plugin** — it exports factories only. Workflows subscribe to events the server packages emit; they don't modify Payload configuration. The cache-revalidation hooks are factories too: you attach them to the collections and globals you choose.

## What this package provides

| Factory | What it does |
|---|---|
| `createRevalidateOnPublishFunction` | Invalidates Next.js caches for the page, listings, and sitemap when content publishes |
| `createPublishAtScheduledTimeFunction` | Publishes a document at its scheduled time by sleeping until then, woken by `content/page.scheduled` |
| `createExecuteScheduledPublishesFunction` | Cron that publishes any document past its scheduled time — the backstop for the one above, or a poller on its own |
| `createExpireStaleApprovalsFunction` | Daily cron that flips pending approvals past `expiresAt` to `expired` and fires an `approval/expired` event |
| `createAuditEventEchoFunction` | Fan-out point: turns `audit/event.recorded` into `notification/send-approval-*` events plus custom handlers |
| `createHealthcheckFunction` | Periodic health monitoring with configurable checks |
| `createTagRevalidationHooks` | Payload `afterChange` / `afterDelete` hooks that drop Next cache tags when a collection or global changes |
| `createCacheTags` | The one tag scheme hooks, workflow and readers all build tags from (also on `@forumone/throughline-workflows/cache-tags`) |

Plus two reusable check helpers used with the healthcheck factory:

- `createPayloadReachableCheck(slug?)` — verifies Payload can `find` from a collection
- `createManifestReachableCheck(url)` — verifies an HTTPS manifest URL responds 2xx

## Installation

```bash
pnpm add @forumone/throughline-workflows
```

Peers: `payload@^3.89.0`, `inngest@^4.0.0`. `next` is an **optional** peer — install it only if you use `createRevalidateOnPublishFunction` or `createTagRevalidationHooks` with their default revalidators.

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
    createRevalidateOnPublishFunction({
      inngest,
      payload,
      // Required. Where each publishable collection is served.
      urlBuilders: {
        pages: (slug) => (slug === 'home' ? '/' : `/${slug}`),
        posts: (slug) => `/news/${slug}`,
      },
      cacheTags, // the same scheme your readers use — see below
    }),
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

The tag-revalidation hooks are the one place this package reaches into Payload configuration, and only because you put them there: they are plain hook functions, not a plugin. They live here rather than in `publishing` because this package already owns Next cache invalidation — the optional `next` peer, the Next 16 `revalidateTag` profile, and the tag `createRevalidateOnPublishFunction` fires — and one tag scheme has to serve both. They use publishing's `isDraftWrite`, which makes `publishing` a dependency of this package. Publishing depends on nothing here, so there is no cycle.

## Cache tags: one scheme, both ends

A cache tag has two ends: a reader that caches under it and a writer that drops it. Nothing in the type system connects them. Name them differently and everything compiles, every test passes, the hook runs, and the page never refreshes. So build both from one object:

```typescript
// src/lib/cache-tags.ts — imported by payload.config.ts, the Inngest route and readers
import { createCacheTags } from '@forumone/throughline-workflows/cache-tags'

export const cacheTags = createCacheTags()
// or name them your way:
// createCacheTags({ collection: (slug) => `c:${slug}`, global: (slug) => `g:${slug}` })
```

The defaults are the bare slug for a collection (`pages`, which is also what `createRevalidateOnPublishFunction` has always fired) and `global_<slug>` for a global. The `/cache-tags` subpath imports nothing, so frontend code can use it without pulling in Payload.

A reader tags its cached read from the same object:

```typescript
import { unstable_cache } from 'next/cache'
import { cacheTags } from '@/lib/cache-tags'

export const getNavigation = unstable_cache(
  async () => (await getPayload({ config })).findGlobal({ slug: 'navigation' }),
  ['navigation'],
  { tags: [cacheTags.global('navigation')] },
)
// With Cache Components: cacheTag(cacheTags.global('navigation')) inside a 'use cache' function.
```

## Tag-revalidation hooks

`createRevalidateOnPublishFunction` reacts to publishing events, so it covers publishes, unpublishes and rollbacks of publishable collections — and nothing else. A global (navigation, footer, settings) is read on every page and usually cached, and nothing publishes it. A collection an integration writes emits no publishing event. A delete is not a publish. Each of those leaves the cached copy standing until the next deploy unless a hook drops it:

```typescript
import { createTagRevalidationHooks } from '@forumone/throughline-workflows'
import { cacheTags } from './lib/cache-tags'

const revalidation = createTagRevalidationHooks({ cacheTags })

const Pages: CollectionConfig = {
  slug: 'pages',
  hooks: {
    // Navigation links to pages and caches their slugs, so a page change drops it too.
    afterChange: [
      revalidation.afterCollectionChange({
        tags: (t, slug) => [t.collection(slug), t.global('navigation')],
      }),
    ],
    afterDelete: [revalidation.afterCollectionDelete()],
  },
  // ...
}

const Media: CollectionConfig = {
  slug: 'media',
  upload: true,
  hooks: {
    // An upload cannot be referenced by anything cached yet.
    afterChange: [revalidation.afterCollectionChange({ operations: ['update'] })],
    afterDelete: [revalidation.afterCollectionDelete()],
  },
  // ...
}

const Navigation: GlobalConfig = {
  slug: 'navigation',
  hooks: { afterChange: [revalidation.afterGlobalChange()] },
  // ...
}
```

What they do:

- **Drop tags, not paths.** Each hook calls `revalidateTag(tag, { expire: 0 })`, the immediate expiry Next 16 requires a profile for. Paths are the workflow's job. A collection hook defaults to `cacheTags.collection(slug)`, a global hook to `cacheTags.global(slug)`; `tags` replaces that list.
- **Skip draft writes.** On `update`, a collection hook asks publishing's `isDraftWrite`, so a draft save or an autosave tick drops nothing, while an unpublish still does. That answer is recorded by `publishingPlugin` for the collections it manages; on any other collection every write counts as visible, which is the safe direction. A `create` that lands as a draft is skipped too: nothing published existed a moment ago. Global hooks drop on every save.
- **Never throw.** A throwing `afterChange` fails the editor's save over a cache miss. Outside a Next request — seeds, migrations, the Payload CLI under `tsx` — Next throws `static generation store missing`; there is no server to be stale, so that is logged at `debug`. Any other failure means the cache did not clear while a server was running, and is logged at `error` with the cause and the tag.
- **Other frontends.** Pass `revalidateTag: (tag) => myCdn.purgeTag(tag)` to drop tags somewhere other than Next.

These overlap with `createRevalidateOnPublishFunction` on a publish — both drop the collection tag — which is harmless: dropping a tag twice is dropping it once. Use the workflow for page paths and the sitemap, and the hooks for everything a publish event never announces.

## Migrating from the built-in URL builders

Before 0.5, `createRevalidateOnPublishFunction` guessed paths: `pages` → `/<slug>` (`home` → `/`), `posts` → `/blog/<slug>`, and any other collection → `/<slug>`. A site whose routes differed revalidated the wrong path without a word. `urlBuilders` is now required and has no built-in entries. A collection with no entry still has its tags dropped, but no path is revalidated and the run logs a warning.

If you relied on the defaults, pass them explicitly — the same behaviour as before:

```typescript
createRevalidateOnPublishFunction({
  inngest,
  payload,
  urlBuilders: {
    pages: (slug) => (slug === 'home' || slug === '' ? '/' : `/${slug}`),
    posts: (slug) => `/blog/${slug}`,
  },
})
```

Then check them against your routes: if your posts are not under `/blog`, they never were being revalidated.

## Non-Next.js frontends

The default `revalidate` function dynamically imports `next/cache`, so the package installs and imports without Next. For other frameworks supply your own:

```typescript
createRevalidateOnPublishFunction({
  inngest,
  payload,
  urlBuilders,
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

- `RevalidateOnPublishOptions` — `urlBuilders` (required), `cacheTags?`, `collectionTags?`, `revalidate?`, `id?`
- `TagRevalidationOptions` — `cacheTags?`, `revalidateTag?`; per hook, `tags?` and (collection `afterChange`) `operations?`
- `PublishAtScheduledTimeOptions` — `collections[]`, `publish`, `maxSleepMs?` (default six days), `id?`
- `ExecuteScheduledPublishesOptions` — `collections[]`, `publish`, `schedule?` (default `*/5 * * * *`), `overdueByMs?` (default 0), `id?`
- `ExpireStaleApprovalsOptions` — `collectionSlug?` (default `approvals`), `schedule?` (default `0 2 * * *`), `id?`
- `AuditEventEchoOptions` — `handlers?`, `id?`
- `HealthcheckOptions` — `checks[]`, `schedule?` (default `*/15 * * * *`), `onFailure?`, `id?`

## Related packages

- `@forumone/throughline-core` — required peer; provides the audit writer the approval-expiration cron uses
- `@forumone/throughline-publishing` — emits the publishing events the revalidation workflow subscribes to, and provides the `isDraftWrite` predicate the tag hooks use (a dependency)
- `@forumone/throughline-approvals` — owns the approvals collection the expiration cron reads
- `@forumone/throughline-email` (C11) — will subscribe to `notification/send-approval-*`

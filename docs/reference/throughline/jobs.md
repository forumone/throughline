# Jobs: `@forumone/throughline/jobs`

The platform's background work, written once against a small interface and run on either Inngest or Payload's own job queue, plus the Payload hooks that keep a Next cache honest. This was `@forumone/throughline-workflows` in 0.x; [`docs/spec/1.0-exports.md`](../../spec/1.0-exports.md) maps its imports.

## What's where

| Subpath         | What                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/jobs`         | `defineJob`, the job types, `jobPayload`, `eventSenderFor`, and the failure handlers below                          |
| `/jobs/inngest` | `inngestJobs(inngest, { onFailure, payload })`, and the Inngest client                                              |
| `/jobs/payload` | `payloadJobs()`                                                                                                     |
| `/publishing`   | `revalidateOnPublishJob`, `publishAtScheduledTimeJob`, `executeScheduledPublishesJob`, `createTagRevalidationHooks` |
| `/approvals`    | `expireStaleApprovalsJob`: flips pending approvals past `expiresAt` to `expired` and fires `approval/expired`       |
| `/audit`        | `auditEventEchoJob`: turns `audit/event.recorded` into `notification/send-approval-*` events, plus custom handlers  |
| `/integrations` | `healthcheckJob`, with `createPayloadReachableCheck(slug?)` and `createManifestReachableCheck(url)`                 |
| `/cache-tags`   | `createCacheTags`: the one tag scheme hooks, jobs and readers all build tags from. Imports nothing.                 |

The failure handlers:

- `createTerminalFailureHandler({ payload })` logs a run that exhausted its retries, writes a `job-failures` row (when `jobFailuresPlugin` from `/observability` is registered) and posts it to `ERROR_WEBHOOK_URL`. Never throws. Give it to the adapter once, as `onFailure`, and every job gets it.
- `createHealthcheckFailureHandler({ payload })` is the healthcheck's own `onFailure`: once per run with failing checks, on the first bad run rather than after retries.

## Installation

Part of [`@forumone/throughline`](../throughline.md#installation). `/jobs/inngest` needs `inngest`. `next` is needed only by `revalidateOnPublishJob` and `createTagRevalidationHooks` with their default revalidators.

`throughline({ jobs })` takes the adapter, and `suite.jobs` is every job its options call for: see [the table](../throughline.md#throughline-options).

## Usage

On Inngest, in your Next.js app's Inngest endpoint:

```typescript
// src/app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { inngest } from '@/lib/inngest'
import { cacheTags } from '@/lib/cache-tags'
import { inngestJobs } from '@forumone/throughline/jobs/inngest'
import { createTerminalFailureHandler } from '@forumone/throughline/jobs'
import {
  executeScheduledPublishesJob,
  revalidateOnPublishJob,
} from '@forumone/throughline/publishing'
import { expireStaleApprovalsJob } from '@forumone/throughline/approvals'
import { auditEventEchoJob } from '@forumone/throughline/audit'
import { createPayloadReachableCheck, healthcheckJob } from '@forumone/throughline/integrations'

const payload = await getPayload({ config })
const jobs = inngestJobs(inngest, { onFailure: createTerminalFailureHandler({ payload }), payload })

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: jobs.functions([
    revalidateOnPublishJob({
      // Required. Where each publishable collection is served.
      urlBuilders: {
        pages: (slug) => (slug === 'home' ? '/' : `/${slug}`),
        posts: (slug) => `/news/${slug}`,
      },
      cacheTags, // the same scheme your readers use — see below
    }),
    executeScheduledPublishesJob({
      collections: [{ slug: 'pages' }, { slug: 'posts' }],
      publish: publishScheduled, // through the publishing service — see below
    }),
    expireStaleApprovalsJob({}),
    auditEventEchoJob({}),
    healthcheckJob({ checks: [createPayloadReachableCheck()] }),
  ]),
})
```

`inngestJobs` registers each job under the function id it has always had, so a run in flight survives an upgrade. On Payload Jobs the same list goes to `payloadJobs()` from `/jobs/payload` instead.

## Cache tags: one scheme, both ends

A cache tag has two ends: a reader that caches under it and a writer that drops it. Nothing in the type system connects them. Name them differently and everything compiles, every test passes, the hook runs, and the page never refreshes. So build both from one object:

```typescript
// src/lib/cache-tags.ts — imported by payload.config.ts, the Inngest route and readers
import { createCacheTags } from '@forumone/throughline/cache-tags'

export const cacheTags = createCacheTags()
// or name them your way:
// createCacheTags({ collection: (slug) => `c:${slug}`, global: (slug) => `g:${slug}` })
```

The defaults are the bare slug for a collection (`pages`, which is also what `revalidateOnPublishJob` has always fired) and `global_<slug>` for a global. The `/cache-tags` subpath imports nothing, so frontend code can use it without pulling in Payload.

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

`revalidateOnPublishJob` reacts to publishing events, so it covers publishes, unpublishes and rollbacks of publishable collections — and nothing else. A global (navigation, footer, settings) is read on every page and usually cached, and nothing publishes it. A collection an integration writes emits no publishing event. A delete is not a publish. Each of those leaves the cached copy standing until the next deploy unless a hook drops it:

```typescript
import { createTagRevalidationHooks } from '@forumone/throughline/publishing'
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

These overlap with `revalidateOnPublishJob` on a publish — both drop the collection tag — which is harmless: dropping a tag twice is dropping it once. Use the workflow for page paths and the sitemap, and the hooks for everything a publish event never announces.

## Migrating from the built-in URL builders

Before 0.5, `revalidateOnPublishJob` guessed paths: `pages` → `/<slug>` (`home` → `/`), `posts` → `/blog/<slug>`, and any other collection → `/<slug>`. A site whose routes differed revalidated the wrong path without a word. `urlBuilders` is now required and has no built-in entries. A collection with no entry still has its tags dropped, but no path is revalidated and the run logs a warning.

If you relied on the defaults, pass them explicitly — the same behaviour as before:

```typescript
revalidateOnPublishJob({
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
revalidateOnPublishJob({
  urlBuilders,
  revalidate: async ({ path, tags }) => {
    if (path) await myCdn.purge(path)
    for (const tag of tags) await myCdn.purgeTag(tag)
  },
})
```

`next` is declared as an optional peer (`peerDependenciesMeta.next.optional = true`) so non-Next consumers don't see a missing-peer warning.

## Scheduled publishing: sleep, don't poll

`publishAtScheduledTimeJob` is woken by `content/page.scheduled` — which
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
publishAtScheduledTimeJob({ collections, publish }),
executeScheduledPublishesJob({
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

`executeScheduledPublishesJob` never writes to Payload. It finds what is
due and calls the `publish` callback you give it, which must be wired to the
publishing service — so a scheduled publish runs the same composition /
accessibility / approval pipeline as an interactive one. A composition error fails
it loudly (audit log + `lastError`) instead of silently writing through, and a
`payload.update` here would skip every gate.

```ts
import { getPublishingService } from '@forumone/throughline/publishing'

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

The audit echo job wires the approval workflow by default. Add custom handlers for any other action:

```typescript
auditEventEchoJob({
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

Every job takes a typed options object. See `src/jobs/workflow-types.ts` for the full surface — defaults documented there. All of them also accept `onTerminalFailure?` and `concurrency?`:

- `RevalidateOnPublishOptions` — `urlBuilders` (required), `cacheTags?`, `collectionTags?`, `revalidate?`, `id?`
- `TagRevalidationOptions` — `cacheTags?`, `revalidateTag?`; per hook, `tags?` and (collection `afterChange`) `operations?`
- `PublishAtScheduledTimeOptions` — `collections[]`, `publish`, `maxSleepMs?` (default six days), `id?`
- `ExecuteScheduledPublishesOptions` — `collections[]`, `publish`, `schedule?` (default `*/5 * * * *`), `overdueByMs?` (default 0), `id?`
- `ExpireStaleApprovalsOptions` — `collectionSlug?` (default `approvals`), `schedule?` (default `0 2 * * *`), `id?`
- `AuditEventEchoOptions` — `handlers?`, `id?`
- `HealthcheckOptions` — `checks[]`, `schedule?` (default `*/15 * * * *`), `onFailure?`, `id?`

## Related

- [Publishing](publishing.md): emits the events the revalidation and scheduling jobs subscribe to, and provides the `isDraftWrite` predicate the tag hooks use
- [Audit](audit.md): the writer the approval-expiration job uses
- [Approvals](approvals.md) owns the collection the expiration job reads, and [Email](email.md) subscribes to `notification/send-approval-*`
- Concept: [Event-driven workflows](../../concepts/event-driven-workflows.md)

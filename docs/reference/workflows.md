# @forumone/throughline-workflows

Inngest function factories for the framework. Five functions: revalidate-on-publish, execute-scheduled-publishes, expire-stale-approvals, audit-event-echo, and healthcheck. Each is a factory you call from your Inngest endpoint and add to the `functions` array.

This package is _not_ a Payload plugin. It's a library of function factories. Wire them in your `apps/web/src/app/api/inngest/route.ts`.

It also ships the Payload hooks that drop Next cache tags when a collection or global changes (`createTagRevalidationHooks`), and the tag scheme they share with your cached reads (`createCacheTags`). You attach those to collections and globals in `payload.config.ts`.

## Install

```bash
pnpm add @forumone/throughline-workflows
```

Peer dependencies: `inngest@^4.0.0`, `payload@^3.89.0`, and optionally `next@>=15` for the default revalidators. Depends on `@forumone/throughline-core` and `@forumone/throughline-publishing` (for `isDraftWrite`).

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
  createTagRevalidationHooks,
  createCacheTags,
  defaultCacheTags,
  createTerminalFailureHandler,
  createHealthcheckFailureHandler,
  failureOptions,
} from '@forumone/throughline-workflows'

// Dependency-free, for frontend code:
import { createCacheTags } from '@forumone/throughline-workflows/cache-tags'

import type {
  BaseWorkflowOptions,
  RevalidateFn,
  RevalidatePathsInput,
  RevalidateOnPublishOptions,
  CacheTags,
  CacheTagScheme,
  TagRevalidationOptions,
  TagRevalidationHooks,
  CollectionTagHookOptions,
  GlobalTagHookOptions,
  TagSelector,
  RevalidateTagFn,
  ScheduledCollectionConfig,
  ExecuteScheduledPublishesOptions,
  ExpireStaleApprovalsOptions,
  AuditEchoEvent,
  AuditEchoHandler,
  AuditEventEchoOptions,
  HealthcheckDefinition,
  HealthcheckOptions,
  HealthcheckResult,
  WorkflowFailureHandler,
  FailureHandlerOptions,
  HealthcheckFailureHandlerOptions,
} from '@forumone/throughline-workflows'
```

## Functions

### `createRevalidateOnPublishFunction(options)`

Subscribes to `content/page.published`, `content/page.unpublished` and `content/page.rolled_back`. For each event it revalidates the document's page path, drops the collection's cache tags, and revalidates `/sitemap.xml`.

```typescript
createRevalidateOnPublishFunction({
  inngest,
  payload,
  urlBuilders: Record<string, (slug: string) => string>,  // required; no built-in entries
  cacheTags?: CacheTags,                  // default: defaultCacheTags
  collectionTags?: Record<string, string[]>, // per-collection override of the scheme
  revalidate?: ({ path, tags }) => Promise<void>, // default: next/cache, loaded on first use
  id?: string,                            // default: 'revalidate-on-publish'
})
```

`urlBuilders` says where each collection's documents are served:

```typescript
urlBuilders: {
  pages: (slug) => (slug === 'home' ? '/' : `/${slug}`),
  programs: (slug) => `/programs/${slug}`,
}
```

A collection with no entry has its tags dropped and no path revalidated, and the run logs a warning. Nothing is guessed: up to 0.4 there were built-in builders (`pages` → `/<slug>`, `posts` → `/blog/<slug>`, anything else → `/<slug>`), and a site whose routes differed revalidated the wrong path silently. To keep the old behaviour, pass those two entries explicitly — see the package README's migration note.

Tags default to `[cacheTags.collection(collection)]` — the bare slug under the default scheme.

In non-Next.js environments, override `revalidate` with your own cache-flushing function.

### `createCacheTags(scheme?)`

The one place tag strings are built. Pass the result to the hooks, to `createRevalidateOnPublishFunction`, and to every cached read (`unstable_cache` tags, `cacheTag()`, `fetch` `next.tags`), so writers and readers cannot name different tags.

```typescript
const cacheTags = createCacheTags({
  collection?: (slug) => string,   // default: slug
  global?: (slug) => string,       // default: `global_${slug}`
})
cacheTags.collection('pages')      // 'pages'
cacheTags.global('navigation')     // 'global_navigation'
```

Also exported from `@forumone/throughline-workflows/cache-tags`, which imports nothing.

### `createTagRevalidationHooks(options?)`

Payload hooks that drop cache tags when content changes — including the changes no publishing event announces: globals, non-publish saves, deletes, and collections an integration writes.

```typescript
const revalidation = createTagRevalidationHooks({
  cacheTags?: CacheTags,                    // default: defaultCacheTags
  revalidateTag?: (tag) => void | Promise<void>, // default: next/cache revalidateTag(tag, { expire: 0 })
})

revalidation.afterCollectionChange({ tags?, operations? }) // CollectionAfterChangeHook
revalidation.afterCollectionDelete({ tags? })              // CollectionAfterDeleteHook
revalidation.afterGlobalChange({ tags? })                  // GlobalAfterChangeHook
```

- `tags: (cacheTags, slug) => string[]` replaces the default (`cacheTags.collection(slug)` or `cacheTags.global(slug)`), e.g. to drop a navigation global when a page it links to changes.
- `operations` limits which `afterChange` operations drop; `['update']` suits an upload collection.
- Collection `afterChange` skips draft writes (autosave included) using publishing's `isDraftWrite`, and skips a document created as a draft. An unpublish still drops.
- A hook never throws. Outside a Next request (seeds, migrations, the CLI) the failure is logged at `debug`; any other failure at `error`, with the tag and the cause.

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

## Failure handlers

Every factory accepts `onTerminalFailure` (handed to Inngest as `onFailure`,
called once when a run has exhausted its retries). The healthcheck also accepts
its own `onFailure`, called once per run with the failing checks. These two
build a handler for each:

```typescript
createTerminalFailureHandler({
  payload?: Payload,            // finds the jobFailuresPlugin writer on it
  writer?: JobFailureWriter,    // instead of the one on payload
  report?: ErrorReporter | false, // default: core's reportError (ERROR_WEBHOOK_URL)
  logger?: Logger,              // default: core's console logger
}): WorkflowFailureHandler

createHealthcheckFailureHandler({
  ...the same,
  functionId?: string,          // recorded as the source; default 'healthcheck'
})
```

Each failure is logged, written to `job-failures` (when `jobFailuresPlugin` is
registered) and reported (when `ERROR_WEBHOOK_URL` is set). Neither handler
throws: an `onFailure` that throws is retried by Inngest. The terminal handler
works as the `onFailure` of any Inngest function, not only these factories.

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
      inngest,
      payload,
      collections: [{ slug: 'pages' }],
      publishingServerUrl: process.env.NEXT_PUBLIC_SERVER_URL!,
      systemApiKey: process.env.PUBLISHING_SYSTEM_API_KEY!,
    }),
    createExpireStaleApprovalsFunction({ inngest, payload }),
    createAuditEventEchoFunction({ inngest }),
    createHealthcheckFunction({
      inngest,
      payload,
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

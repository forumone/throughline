# Phase C10 — Workflows Package

## Goal

Build `@forumone/claude-cms-workflows` — a set of composable Inngest functions for the common async work every deployment needs: revalidating Next.js routes on publish, executing scheduled publishes, expiring stale approvals, echoing audit events, running healthchecks. Client apps import the functions they want and merge them into their Inngest endpoint alongside integration functions and any client-specific workflows.

## Prerequisites

- C4 complete; Inngest client factory and event taxonomy
- C6 complete; publishing events are fired
- C7 complete; approval events and expiration state

## Context

By this point, every server package fires Inngest events when consequential things happen. What's missing is the subscriber side — the functions that react to those events. C10 packages that up as composable workflows.

The design is deliberately unopinionated: **core ships factories, client apps assemble.** Each workflow is a factory function that takes a configured Inngest client and returns an `InngestFunction`. Client apps import the factories they need, call them with their Inngest client, and include the results in their `serve()` call.

```typescript
// Client app's /api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import {
  createRevalidateOnPublishFunction,
  createExecuteScheduledPublishesFunction,
  createExpireStaleApprovalsFunction,
  createAuditEventEchoFunction,
  createHealthcheckFunction,
} from '@forumone/claude-cms-workflows'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    createRevalidateOnPublishFunction({ inngest, payload }),
    createExecuteScheduledPublishesFunction({ inngest, payload, publishingServerUrl: '...' }),
    createExpireStaleApprovalsFunction({ inngest, payload }),
    createAuditEventEchoFunction({ inngest }),
    createHealthcheckFunction({ inngest, payload }),
    // plus client-specific functions and integration functions
  ],
})
```

This shape lets clients:

- Pick and choose which workflows they want
- Configure each independently (different cron schedules, different retry policies, etc.)
- Mix with their own custom Inngest functions seamlessly
- Override any core behavior by supplying their own equivalent function

The package has no plugin — it exports factories only. This is a deliberate departure from the server packages; workflows don't modify Payload config, they just subscribe to events the other plugins emit.

## Tasks

### C10.1 — Scaffold the package

```
packages/workflows/
├── src/
│   ├── revalidate-on-publish.ts
│   ├── execute-scheduled-publishes.ts
│   ├── expire-stale-approvals.ts
│   ├── audit-event-echo.ts
│   ├── healthcheck.ts
│   ├── types.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── CHANGELOG.md
```

`package.json`:

```json
{
  "name": "@forumone/claude-cms-workflows",
  "version": "0.1.0",
  "description": "Composable Inngest functions for the common async work in the Claude-First CMS framework.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "files": ["dist", "README.md", "CHANGELOG.md"],
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b -w",
    "clean": "rm -rf dist .turbo",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "peerDependencies": {
    "inngest": "^3.0.0",
    "next": "^15.0.0",
    "payload": "^3.0.0"
  },
  "dependencies": {
    "@forumone/claude-cms-core": "workspace:*"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-eslint-config": "workspace:*",
    "inngest": "^3.0.0",
    "next": "^15.0.0",
    "payload": "^3.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Next.js is a peer dependency because we call `revalidatePath` and `revalidateTag`. Clients using non-Next.js frontends will need to supply their own revalidation function (documented later).

### C10.2 — Define shared types

`src/types.ts`:

```typescript
import type { Inngest } from 'inngest'
import type { Payload } from 'payload'

export interface BaseWorkflowOptions {
  inngest: Inngest
  payload: Payload
}

export interface RevalidateOnPublishOptions extends BaseWorkflowOptions {
  /**
   * Custom revalidation function. If not provided, uses Next.js's
   * revalidatePath and revalidateTag. Supply a custom function for non-Next.js
   * frontends or more complex cache invalidation.
   */
  revalidate?: (paths: { path: string; tags: string[] }) => Promise<void>
  /**
   * Map collection slugs to URL path builders. Default: pages → /slug, posts → /blog/slug.
   */
  urlBuilders?: Record<string, (slug: string) => string>
  /**
   * Additional tags to revalidate for each collection. Default: the collection slug itself.
   */
  collectionTags?: Record<string, string[]>
}

export interface ExecuteScheduledPublishesOptions extends BaseWorkflowOptions {
  /**
   * Which collections have scheduled publishing. Each specifies the field names used.
   */
  collections: Array<{
    slug: string
    statusField?: string
    scheduledField?: string
  }>
  /**
   * Cron schedule. Default: every 5 minutes.
   */
  schedule?: string
  /**
   * The base URL of the deployment's publishing server. Scheduled publishes
   * call through the server's publish tool (not directly updating Payload)
   * so the full pipeline runs.
   */
  publishingServerUrl: string
  /**
   * API key with publishing.execute scope. Read from PUBLISHING_SYSTEM_API_KEY
   * env var if not provided.
   */
  publishingApiKey?: string
}

export interface ExpireStaleApprovalsOptions extends BaseWorkflowOptions {
  /**
   * Approvals collection slug. Default: 'approvals'.
   */
  collectionSlug?: string
  /**
   * Cron schedule. Default: once per day at 2am UTC.
   */
  schedule?: string
}

export interface AuditEventEchoOptions {
  inngest: Inngest
  /**
   * Optional handlers to run on specific audit actions. Each handler can
   * inspect the audit event and fire downstream Inngest events. This is
   * the extension point where, for example, approval.requested triggers
   * a notification workflow.
   */
  handlers?: Array<{
    match: (event: { action: string }) => boolean
    handle: (event: { action: string; data: Record<string, unknown> }) => Promise<void>
  }>
}

export interface HealthcheckOptions extends BaseWorkflowOptions {
  /**
   * Named checks that run on the cron. Each returns ok/not-ok plus details.
   */
  checks: Array<{
    name: string
    run: (ctx: { payload: Payload }) => Promise<{ ok: boolean; details?: string }>
  }>
  /**
   * Cron schedule. Default: every 15 minutes.
   */
  schedule?: string
  /**
   * Called when any check fails. Defaults to console.error. Real deployments
   * should route this to a monitoring service or notification channel.
   */
  onFailure?: (failures: Array<{ name: string; details?: string }>) => Promise<void>
}
```

### C10.3 — Build the revalidate-on-publish function

`src/revalidate-on-publish.ts`:

```typescript
import type { InngestFunction } from 'inngest'
import type { RevalidateOnPublishOptions } from './types'

export function createRevalidateOnPublishFunction(options: RevalidateOnPublishOptions): InngestFunction {
  const urlBuilders = {
    pages: (slug: string) => `/${slug === 'home' ? '' : slug}`,
    posts: (slug: string) => `/blog/${slug}`,
    ...options.urlBuilders,
  }

  const collectionTags = {
    pages: ['pages'],
    posts: ['posts'],
    ...options.collectionTags,
  }

  const revalidate = options.revalidate ?? defaultRevalidate

  return options.inngest.createFunction(
    { id: 'revalidate-on-publish', retries: 5 },
    [
      { event: 'content/page.published' },
      { event: 'content/page.unpublished' },
      { event: 'content/page.rolled_back' },
    ],
    async ({ event, step, logger }) => {
      const { collection, slug } = event.data as { collection: string; slug: string }

      await step.run('revalidate-page-path', async () => {
        const builder = urlBuilders[collection] ?? ((s: string) => `/${s}`)
        const path = builder(slug)
        const tags = collectionTags[collection] ?? [collection]
        await revalidate({ path, tags })
        logger.info('Revalidated', { path, tags })
      })

      await step.run('revalidate-listings', async () => {
        // Listing pages typically live at /blog or /programs; revalidate by tag.
        const tags = collectionTags[collection] ?? [collection]
        await revalidate({ path: '', tags })
      })

      await step.run('revalidate-sitemap', async () => {
        await revalidate({ path: '/sitemap.xml', tags: ['sitemap'] })
      })

      return { collection, slug, revalidated: true }
    },
  )
}

async function defaultRevalidate({ path, tags }: { path: string; tags: string[] }): Promise<void> {
  // Dynamic import so non-Next.js consumers don't fail on import.
  const { revalidatePath, revalidateTag } = await import('next/cache')
  if (path) revalidatePath(path)
  for (const tag of tags) revalidateTag(tag)
}
```

### C10.4 — Build the scheduled publish executor

`src/execute-scheduled-publishes.ts`:

```typescript
import type { InngestFunction } from 'inngest'
import type { ExecuteScheduledPublishesOptions } from './types'

export function createExecuteScheduledPublishesFunction(
  options: ExecuteScheduledPublishesOptions,
): InngestFunction {
  const schedule = options.schedule ?? '*/5 * * * *'
  const apiKey = options.publishingApiKey ?? process.env.PUBLISHING_SYSTEM_API_KEY

  if (!apiKey) {
    throw new Error(
      'createExecuteScheduledPublishesFunction requires publishingApiKey or PUBLISHING_SYSTEM_API_KEY env var',
    )
  }

  return options.inngest.createFunction(
    { id: 'execute-scheduled-publishes' },
    { cron: schedule },
    async ({ step, logger }) => {
      const nowIso = new Date().toISOString()

      for (const collectionConfig of options.collections) {
        const statusField = collectionConfig.statusField ?? '_status'
        const scheduledField = collectionConfig.scheduledField ?? 'scheduledPublishAt'

        const due = await step.run(`find-due-${collectionConfig.slug}`, async () => {
          const result = await options.payload.find({
            collection: collectionConfig.slug,
            where: {
              and: [
                { [statusField]: { equals: 'draft' } },
                { [scheduledField]: { exists: true } },
                { [scheduledField]: { less_than_equal: nowIso } },
              ],
            },
            limit: 100,
          })
          return result.docs.map((d) => ({ id: String(d.id), title: String(d.title ?? d.id) }))
        })

        for (const doc of due) {
          await step.run(`publish-${collectionConfig.slug}-${doc.id}`, async () => {
            const response = await fetch(`${options.publishingServerUrl}/api/publishing/mcp`, {
              method: 'POST',
              headers: {
                authorization: `Bearer ${apiKey}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                  name: 'publish',
                  arguments: {
                    collection: collectionConfig.slug,
                    id: doc.id,
                    _meta: {
                      reasoning: 'Scheduled publish executed by workflow cron',
                    },
                  },
                },
              }),
            })

            if (!response.ok) {
              throw new Error(`Scheduled publish failed for ${doc.title}: HTTP ${response.status}`)
            }

            const body = (await response.json()) as {
              result?: { content?: Array<{ text?: string }> }
              error?: { message: string }
            }

            if (body.error) {
              // A policy check failed (e.g., composition error). Log but don't retry;
              // the schedule becomes a missed publish, which is surfaced in the audit log.
              logger.warn('Scheduled publish blocked by policy', {
                document: doc.title,
                reason: body.error.message,
              })
            } else {
              logger.info('Scheduled publish succeeded', { document: doc.title })
            }
          })
        }
      }

      return { processedCount: 0 } // The per-doc step returns track individual counts
    },
  )
}
```

Note: calling the Publishing Server's MCP endpoint rather than bypassing to Payload directly means scheduled publishes go through the same policy pipeline as Claude-initiated publishes. A composition error in a scheduled publish gets the same treatment as one caught interactively.

### C10.5 — Build the approval expiration function

`src/expire-stale-approvals.ts`:

```typescript
import type { InngestFunction } from 'inngest'
import type { ExpireStaleApprovalsOptions } from './types'
import { getAuditWriter } from '@forumone/claude-cms-core'

export function createExpireStaleApprovalsFunction(
  options: ExpireStaleApprovalsOptions,
): InngestFunction {
  const schedule = options.schedule ?? '0 2 * * *' // daily at 2am UTC
  const collectionSlug = options.collectionSlug ?? 'approvals'

  return options.inngest.createFunction(
    { id: 'expire-stale-approvals' },
    { cron: schedule },
    async ({ step, logger }) => {
      const now = new Date().toISOString()

      const expired = await step.run('find-expired', async () => {
        const result = await options.payload.find({
          collection: collectionSlug,
          where: {
            and: [
              { status: { equals: 'pending' } },
              { expiresAt: { less_than: now } },
            ],
          },
          limit: 500,
        })
        return result.docs.map((d) => ({
          id: String(d.id),
          targetCollection: String(d.targetCollection),
          targetId: String(d.targetId),
          targetTitle: String(d.targetTitle),
          requestedBy: String((d.requestedBy as { id?: string })?.id ?? d.requestedBy),
        }))
      })

      const auditWriter = getAuditWriter(options.payload)

      for (const approval of expired) {
        await step.run(`expire-${approval.id}`, async () => {
          await options.payload.update({
            collection: collectionSlug,
            id: approval.id,
            data: { status: 'expired' },
          })

          await auditWriter({
            actor: { type: 'system', apiKeyName: 'workflow:expire-stale-approvals' },
            action: 'approval.expired',
            mcpServer: 'approvals',
            mcpTool: 'expire-stale-approvals',
            targetCollection: approval.targetCollection,
            targetId: approval.targetId,
            targetTitle: approval.targetTitle,
            approvalRequestId: approval.id,
          })

          // Fire an event so the email workflow can notify the requester
          await options.inngest.send({
            name: 'approval/expired',
            data: { approvalId: approval.id, requesterId: approval.requestedBy },
          })
        })
      }

      logger.info('Expired stale approvals', { count: expired.length })
      return { expiredCount: expired.length }
    },
  )
}
```

### C10.6 — Build the audit event echo function

`src/audit-event-echo.ts`:

```typescript
import type { InngestFunction } from 'inngest'
import type { AuditEventEchoOptions } from './types'

export function createAuditEventEchoFunction(options: AuditEventEchoOptions): InngestFunction {
  return options.inngest.createFunction(
    { id: 'audit-event-echo' },
    { event: 'audit/event.recorded' },
    async ({ event, step, logger }) => {
      const data = event.data as { action: string; approvalRequestId?: string; integrationId?: string }
      logger.info('Audit event', { action: data.action })

      // Built-in handlers
      await step.run('handle-approval-requested', async () => {
        if (data.action === 'approval.requested' && data.approvalRequestId) {
          await options.inngest.send({
            name: 'notification/send-approval-request',
            data: { approvalId: data.approvalRequestId },
          })
        }
      })

      await step.run('handle-approval-decided', async () => {
        if (
          (data.action === 'approval.granted' ||
            data.action === 'approval.declined' ||
            data.action === 'approval.changes_requested') &&
          data.approvalRequestId
        ) {
          await options.inngest.send({
            name: 'notification/send-approval-decision',
            data: { approvalId: data.approvalRequestId, decision: data.action },
          })
        }
      })

      // Custom handlers from options
      if (options.handlers) {
        for (const handler of options.handlers) {
          await step.run(`custom-handler-${handler.match.name || 'anon'}`, async () => {
            if (handler.match({ action: data.action })) {
              await handler.handle({ action: data.action, data: data as Record<string, unknown> })
            }
          })
        }
      }
    },
  )
}
```

This function is the single point where audit events fan out to notification workflows. The email package (C11) subscribes to `notification/send-approval-request` and `notification/send-approval-decision`. Custom handlers in options let client apps add their own fan-out (e.g., "when integration.failed happens, post to our #alerts Slack channel").

### C10.7 — Build the healthcheck function

`src/healthcheck.ts`:

```typescript
import type { InngestFunction } from 'inngest'
import type { HealthcheckOptions } from './types'

export function createHealthcheckFunction(options: HealthcheckOptions): InngestFunction {
  const schedule = options.schedule ?? '*/15 * * * *'
  const onFailure = options.onFailure ?? defaultOnFailure

  return options.inngest.createFunction(
    { id: 'healthcheck' },
    { cron: schedule },
    async ({ step, logger }) => {
      const results: Array<{ name: string; ok: boolean; details?: string }> = []

      for (const check of options.checks) {
        const result = await step.run(`check-${check.name}`, async () => {
          try {
            const outcome = await check.run({ payload: options.payload })
            return { name: check.name, ...outcome }
          } catch (error) {
            return {
              name: check.name,
              ok: false,
              details: error instanceof Error ? error.message : 'Unknown error',
            }
          }
        })
        results.push(result)
      }

      const failures = results.filter((r) => !r.ok)

      if (failures.length > 0) {
        await step.run('report-failures', async () => {
          await onFailure(failures)
        })
      }

      // Fire a system/healthcheck event for any downstream subscribers
      await options.inngest.send({
        name: 'system/healthcheck',
        data: {
          source: 'workflow',
          timestamp: new Date().toISOString(),
        },
      })

      logger.info('Healthcheck complete', {
        totalChecks: results.length,
        failures: failures.length,
      })

      return { results, failures: failures.length }
    },
  )
}

async function defaultOnFailure(failures: Array<{ name: string; details?: string }>): Promise<void> {
  console.error(
    `[healthcheck] ${failures.length} check(s) failed:`,
    failures.map((f) => `${f.name}: ${f.details ?? 'no details'}`).join('; '),
  )
}

/**
 * Commonly useful check: Payload is reachable and can query a collection.
 */
export function createPayloadReachableCheck(collectionSlug = 'users') {
  return {
    name: 'payload-reachable',
    run: async ({ payload }: { payload: import('payload').Payload }) => {
      try {
        await payload.find({ collection: collectionSlug, limit: 1 })
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          details: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },
  }
}

/**
 * Commonly useful check: a design system manifest is loadable.
 */
export function createManifestReachableCheck(manifestUrl: string) {
  return {
    name: 'manifest-reachable',
    run: async () => {
      try {
        const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(5000) })
        if (response.ok) return { ok: true }
        return { ok: false, details: `HTTP ${response.status}` }
      } catch (error) {
        return {
          ok: false,
          details: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },
  }
}
```

### C10.8 — Build the index

`src/index.ts`:

```typescript
export { createRevalidateOnPublishFunction } from './revalidate-on-publish'
export { createExecuteScheduledPublishesFunction } from './execute-scheduled-publishes'
export { createExpireStaleApprovalsFunction } from './expire-stale-approvals'
export { createAuditEventEchoFunction } from './audit-event-echo'
export {
  createHealthcheckFunction,
  createPayloadReachableCheck,
  createManifestReachableCheck,
} from './healthcheck'

export type {
  BaseWorkflowOptions,
  RevalidateOnPublishOptions,
  ExecuteScheduledPublishesOptions,
  ExpireStaleApprovalsOptions,
  AuditEventEchoOptions,
  HealthcheckOptions,
} from './types'
```

### C10.9 — Write tests

Testing priorities:

- `revalidate-on-publish` — event handler fires correct revalidation calls (mock next/cache)
- `execute-scheduled-publishes` — finds due documents, calls publishing server, handles policy rejections
- `expire-stale-approvals` — expires correct records, writes audit events, fires expiration events
- `audit-event-echo` — approval actions trigger notification events, custom handlers run
- `healthcheck` — runs all checks, collects failures, calls onFailure, fires system event

Use Inngest's test utilities (`@inngest/middleware-test`) or simple mocks. The functions are pure factories around pure event handlers, so testing is straightforward.

### C10.10 — Write the README

`README.md`:

```markdown
# @forumone/claude-cms-workflows

Composable Inngest functions for the Claude-First CMS framework. Client apps
import the factories they need and merge the functions into their Inngest
endpoint.

## What this package provides

- `createRevalidateOnPublishFunction` — invalidates Next.js caches when content publishes
- `createExecuteScheduledPublishesFunction` — cron-driven scheduled publishing
- `createExpireStaleApprovalsFunction` — auto-expires pending approvals after N days
- `createAuditEventEchoFunction` — fans out audit events to notification workflows
- `createHealthcheckFunction` — periodic system health monitoring

Plus helper factories:
- `createPayloadReachableCheck` — checks Payload is reachable
- `createManifestReachableCheck` — checks a manifest URL is reachable

## Installation

```bash
pnpm add @forumone/claude-cms-workflows
```

## Usage

In your Next.js app's Inngest endpoint:

```typescript
// src/app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { getPayload } from 'payload'
import { inngest } from '@/lib/inngest'
import {
  createRevalidateOnPublishFunction,
  createExecuteScheduledPublishesFunction,
  createExpireStaleApprovalsFunction,
  createAuditEventEchoFunction,
  createHealthcheckFunction,
  createPayloadReachableCheck,
} from '@forumone/claude-cms-workflows'
import config from '@/payload.config'

const payload = await getPayload({ config })

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    createRevalidateOnPublishFunction({
      inngest,
      payload,
      collectionTags: { programs: ['programs'], people: ['people'] },
    }),
    createExecuteScheduledPublishesFunction({
      inngest,
      payload,
      collections: [{ slug: 'pages' }, { slug: 'posts' }],
      publishingServerUrl: process.env.NEXT_PUBLIC_SERVER_URL!,
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

## Non-Next.js frontends

The revalidation function uses `next/cache` by default. For other frameworks,
supply a `revalidate` function:

```typescript
createRevalidateOnPublishFunction({
  inngest,
  payload,
  revalidate: async ({ path, tags }) => {
    // Your cache invalidation logic
    await myCache.purge(path)
    for (const tag of tags) await myCache.purgeTag(tag)
  },
})
```

## Customizing audit event routing

The audit event echo function fires notification events for approval actions by
default. Add custom handlers for other actions:

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
```

### C10.11 — Changeset

```bash
pnpm changeset
```

Select `@forumone/claude-cms-workflows`, choose `minor`:

> Initial release. Five composable Inngest function factories for the common async work in the framework: revalidate-on-publish, execute-scheduled-publishes, expire-stale-approvals, audit-event-echo, healthcheck. Plus commonly useful health check helpers.

## Acceptance criteria

- [ ] All five function factories produce valid Inngest functions
- [ ] Revalidation handles pages and posts by default, accepts custom URL builders
- [ ] Scheduled publish executor calls through the Publishing Server's MCP (not direct Payload writes)
- [ ] Approval expiration writes audit events and fires expired events
- [ ] Audit event echo fires notification events for approval actions
- [ ] Healthcheck runs configurable checks, reports failures through onFailure
- [ ] Package has no Payload plugin (it's factories only)
- [ ] Next.js is a peer dependency so non-Next consumers aren't forced to install it
- [ ] Test coverage 80%+

## Notes for Claude Code

- The scheduled publish function's choice to call the Publishing Server's MCP endpoint rather than bypassing to Payload is deliberate. It means scheduled publishes go through the same pipeline as interactive publishes, including all policy checks. This is what users expect — "I scheduled this for Tuesday; why did it fail silently?" — they want Tuesday's publish to fail the same way an immediate publish would, with audit trail and error message.
- The `audit-event-echo` function is the fan-out point. Every downstream notification workflow subscribes to the events it fires. Keep the built-in handlers minimal and document the extension pattern clearly.
- Next.js is peer-dependent. Dynamic import of `next/cache` inside the default revalidate function is what makes the package work in non-Next contexts. Don't statically import from `next/*` at the module top level.
- The `createPayloadReachableCheck` and `createManifestReachableCheck` helpers are intentional over-engineering. They exist because healthchecks are repetitive and every client will write similar ones. Shipping two example helpers makes the pattern obvious.
- Commit after each factory is complete. These are small, independent pieces.

## What's next

Phase C11 builds the email package — Resend client wrapper, React Email templates with brand tokens, and the Inngest functions that subscribe to the notification events this package's audit echo fires. After C11, the approval workflow is fully operational end to end.

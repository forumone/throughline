# Event-driven workflows

Throughline's plugins fire events; subscribers react. The plugins themselves don't know who's listening. This is what makes the system extensible without forking core, and what keeps publish latency from compounding with every feature you add.

## Why events instead of direct calls

Imagine the alternative. The Publishing plugin's `publish` call directly invokes:

- Next.js cache invalidation
- The Email plugin's "publish notification" workflow
- The Integrations plugin's "sync to CRM" worker
- A custom "post to Slack" call from your client project

Each call is a chance to fail. If the CRM is down, does publish fail? If Slack rate-limits, does the next publish queue behind it? If a client adds a fifth side effect, do they patch the Publishing plugin?

Events answer all of these. Publishing fires `content/page.published`. Whoever's listening reacts independently. Failures retry independently. New subscribers add files; they don't touch core.

## Inngest as the integration boundary

Inngest gives us:

- **Durable execution** — workers can `step.run` to checkpoint between async operations. Crashes resume from the last checkpoint, not the top.
- **Automatic retries** — failed `step.run` calls retry with backoff. Permanent failures land in a dead-letter that you can replay.
- **Concurrency control** — limit how many runs of a function can fire in parallel. Useful when downstream services have rate limits.
- **A dashboard** — every run is visible, every step's input and output is logged, every retry is traceable.
- **No queue infrastructure** — Inngest's hosted service or self-hosted dev server handles the backend. You write functions, not queue plumbing.

We could in principle use a different runner (a queue + workers, BullMQ, durable functions, etc.). Inngest's combination of dev DX, durable execution, and the built-in dashboard made the choice easy.

## Event taxonomy

Events use slash-namespaced names. The first segment is the domain, the second is the entity, the third is the action.

| Event | Fired by | Carries |
| --- | --- | --- |
| `content/page.published` | publishing | `{ collection, id, version, publishedBy, publishedAt }` |
| `content/page.unpublished` | publishing | `{ collection, id, unpublishedBy }` |
| `content/page.scheduled` | publishing | `{ collection, id, scheduledFor, scheduledBy }` |
| `content/page.rolled_back` | publishing | `{ collection, id, fromVersion, toVersion, rolledBackBy }` |
| `approval/requested` | approvals | `{ approvalId, targetCollection, targetId, requesterUserId, approverGroupSlugs }` |
| `approval/granted` | approvals | `{ approvalId, decidedByUserId, decidedAt }` |
| `approval/declined` | approvals | `{ approvalId, decidedByUserId, reason }` |
| `approval/changes_requested` | approvals | `{ approvalId, decidedByUserId, comment }` |
| `approval/expired` | workflows (cron) | `{ approvalId, expiredAt }` |
| `audit/event.recorded` | audit | the audit record itself |
| `form/submission.received` | forms | `{ formId, submissionId, ipHash, fields, destinations }` |
| `integration/<slug>.<action>` | integrations | per-integration shape |
| `system/healthcheck.completed` | workflows (cron) | `{ checks: [{ name, ok, details }], at }` |

Subscribers register Inngest functions that filter on event names:

```typescript
inngest.createFunction(
  { id: 'sync-published-page-to-cms-X' },
  { event: 'content/page.published' },
  async ({ event, step }) => {
    await step.run('fetch-page', async () => { /* ... */ })
    await step.run('post-to-cms-x', async () => { /* ... */ })
  },
)
```

## Where the framework's subscribers live

- **`@forumone/throughline-workflows`** — the framework's own workers
  - `createRevalidateOnPublishFunction` — subscribes to `content/page.*`, calls `revalidatePath`
  - `createExecuteScheduledPublishesFunction` — cron, finds due `scheduledPublishAt` rows and calls Publishing MCP
  - `createExpireStaleApprovalsFunction` — cron, finds stale approvals and fires `approval/expired`
  - `createAuditEventEchoFunction` — subscribes to `approval/*` and writes audit rows
  - `createHealthcheckFunction` — cron, runs registered healthchecks
- **`@forumone/throughline-email`** — `notify-approval-request`, `notify-approval-decision`, `notify-approval-expired`
- **`@forumone/throughline-forms`** — `fan-out`, `email-destination`, `webhook-destination`, `submitter-confirmation`
- **`@forumone/throughline-integrations`** — each registered `Integration` contributes its own functions

All of these compose into a single Inngest endpoint at `/api/inngest`. The factory pattern means each function is independently testable; their behavior doesn't depend on the order they're registered.

## Adding your own subscribers

In your client project:

```typescript
// apps/web/src/inngest/functions/post-to-slack.ts
import { inngest } from '@/inngest/client'

export const postPublishedPageToSlack = inngest.createFunction(
  { id: 'post-published-page-to-slack' },
  { event: 'content/page.published' },
  async ({ event, step }) => {
    await step.run('post', () => fetch(SLACK_WEBHOOK, { /* ... */ }))
  },
)

// apps/web/src/app/api/inngest/route.ts
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // ...framework-supplied functions
    postPublishedPageToSlack,
  ],
})
```

That's it. No core changes, no plugin edits.

## Local development

Run the Inngest dev server alongside `pnpm dev`:

```bash
npx inngest-cli@latest dev
```

It auto-discovers your `/api/inngest` endpoint, lists every function, and shows live runs at `http://localhost:8288`. Trigger an event by publishing a page and watch the runs cascade.

## Production

Provision an Inngest app, set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in your environment, and the same code talks to the hosted service. See [Deploying to Vercel](../getting-started/deploying-to-vercel.md).

## Failure handling

The framework's stance:

- **Publish itself is synchronous.** It either succeeds or fails before returning. The publish event fires only after the row is in `_status: 'published'`.
- **Subscribers are best-effort.** A failing subscriber retries; permanent failure lands in a dead-letter queue. The publish itself doesn't roll back.
- **Failures are surfaced.** Inngest dashboards show every failed run; the audit log records `system/integration-error` events when an integration's worker fails permanently.

If a side effect must succeed for the publish to be valid (rare), wire it inline in the Publishing pipeline — the AccessibilityCheck mechanism is one place to do this synchronously. But the design strongly prefers async side effects with visible failures over inline side effects with implicit blocking.

## Where to look in code

- `packages/core/src/events/taxonomy.ts` — the canonical event names + payload types
- `packages/workflows/src/*.ts` — every framework-supplied subscriber, one per file
- `packages/email/src/functions/*.ts`, `packages/forms/src/functions/*.ts` — plugin-owned subscribers
- `apps/web/src/app/api/inngest/route.ts` (in a generated project) — registration point

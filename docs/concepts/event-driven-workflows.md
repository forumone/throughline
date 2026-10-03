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

Inngest is the default, not the only runner. From 1.0 every job is written once against a small interface, `defineJob` in `@forumone/throughline/jobs`, and runs on either Inngest (`inngestJobs(inngest)`) or Payload's own job queue (`payloadJobs()`). Inngest's combination of dev DX, durable execution, and the built-in dashboard is why it is the default; Payload Jobs is for a site that wants no second service. See [Jobs](../reference/throughline/jobs.md).

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
| `approval/expired` | approvals (expiry job, cron) | `{ approvalId, expiredAt }` |
| `audit/event.recorded` | audit | the audit record itself |
| `integration/<slug>.<action>` | integrations | per-integration shape |
| `system/healthcheck.completed` | integrations (healthcheck job, cron) | `{ checks: [{ name, ok, details }], at }` |

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

Each is a job in `@forumone/throughline`, on the subpath of the plugin it belongs to, and `throughline()` lists the ones its options call for in `suite.jobs`:

- **`/publishing`**
  - `revalidateOnPublishJob` — subscribes to `content/page.*`, revalidates the page path the site's `urls` give and drops the collection's cache tags
  - `publishAtScheduledTimeJob` — sleeps until a schedule is due, then publishes through the pipeline; `executeScheduledPublishesJob` is its daily backstop
  - Not a subscriber, but alongside: `createTagRevalidationHooks` — Payload hooks that drop cache tags on the changes no event announces (globals, non-publish saves, deletes), named by the same `createCacheTags` scheme as the readers
- **`/approvals`** — `expireStaleApprovalsJob`: cron, finds stale approvals and fires `approval/expired`
- **`/audit`** — `auditEventEchoJob`: subscribes to `audit/event.recorded` and fans out the approval notifications
- **`/integrations`** — `healthcheckJob`: cron, runs the configured healthchecks; and each registered `Integration` contributes its own jobs through `createJobs`
- **`/email`** — `notify-approval-request`, `notify-approval-decision`, `notify-approval-expired`

On Inngest, all of these compose into a single endpoint at `/api/inngest`; on Payload Jobs, `suite.plugin` registers them. Each job is independently testable, and its behavior doesn't depend on the order it's registered in.

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
  functions: [...jobs.functions(suite.jobs), postPublishedPageToSlack],
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
- **Subscribers are best-effort.** A failing subscriber retries; the publish itself doesn't roll back.
- **Failures are surfaced — if you wire them.** Inngest's dashboard shows every failed run. A run that exhausts its retries is recorded and reported only when it has a failure handler: `createTerminalFailureHandler` from `@forumone/throughline/jobs`, given once to the adapter as `inngestJobs(inngest, { onFailure, payload })` (or as `onFailure` to your own `createFunction`), logs it, writes a `job-failures` row and posts it to `ERROR_WEBHOOK_URL`. The scaffold wires it for every job in `suite.jobs`. An integration's own failure also writes an `integration.failed` audit row through `ctx.recordAudit`. See [Observability](../operations/observability.md#job-failures).

If a side effect must succeed for the publish to be valid (rare), wire it inline in the Publishing pipeline — the AccessibilityCheck mechanism is one place to do this synchronously. But the design strongly prefers async side effects with visible failures over inline side effects with implicit blocking.

## Where to look in code

- `packages/throughline/src/events/taxonomy.ts` — the canonical event names + payload types
- `packages/throughline/src/jobs/` — `defineJob`, the two adapters and the failure handlers
- `packages/throughline/src/*/jobs/*.ts` — every framework-supplied job, beside the plugin it belongs to; the email jobs are in `src/email/functions/`
- `apps/web/src/app/api/inngest/route.ts` (in a generated project) — where `suite.jobs` is served

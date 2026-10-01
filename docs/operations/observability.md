# Observability

Four places to look when something's wrong, and an honest account of what each
one contains — plus one place errors are *sent*, which is the only one that
tells somebody without them having to go and look.

> **This document was wrong, and the corrections are the point.** Audit 12 H3
> ran every SQL example in it against the database. All of them failed on
> `relation "audit-log" does not exist`, the column names in them matched no
> column, and one of the actions they filtered on is not in the enum. The prose
> claimed the audit log records errors, form submissions and cron runs; the
> first two were action names with no writer and the third still is. A runbook
> that cannot be executed is worse than no runbook, because it is read during an
> incident by somebody who has no time to check it.
>
> `system.error` now has a writer — see below. The other claims are corrected
> rather than implemented, and where something is missing this says so.

## The audit log

Every **MCP tool call** that mutates state writes a row, and so does any tool
that throws. The collection is `audit-events`; the table is `audit_events`.

That "MCP tool call" is the shape of the whole thing, and explains the columns.
`mcpServer` and `mcpTool` are `NOT NULL`, so every row answers "which tool did
this" — which also means a code path that is not a tool has nowhere to write
without borrowing a server's name. The one cron that writes here does exactly
that (`expire-stale-approvals` writes as `approvals`/`expire-stale-approvals`),
because expiring an approval is an approval action and has an owning server.

A job that *failed* is not an action anybody took, and does not borrow a name.
It goes to [the job-failures collection](#job-failures) instead.

### Schema

Payload field, then the Postgres column, because the two differ and the SQL
below needs the second:

| Field | Column | Notes |
| --- | --- | --- |
| `createdAt` | `created_at` | `timestamptz`, `NOT NULL`. **There is no `timestamp` column.** |
| `actor.type` | `actor_type` | `'user' \| 'system' \| 'integration'`, `NOT NULL` |
| `actor.userId` | `actor_user_id` | `varchar`, not a foreign key |
| `actor.userName` | `actor_user_name` | |
| `actor.apiKeyName` | `actor_api_key_name` | `'mcp-api-key'` for a key-authenticated call; `'workflow:<id>'` for a cron |
| `actor.apiKeyId` | `actor_api_key_id` | |
| `actor.sessionId` | `actor_session_id` | Would group one conversation's writes. **Always NULL today** — `McpToolContext.sessionId` exists and nothing on the request path sets it |
| `action` | `action` | `enum_audit_events_action`, `NOT NULL` — the list below |
| `mcpServer` | `mcp_server` | `enum_audit_events_mcp_server`, `NOT NULL` |
| `mcpTool` | `mcp_tool` | `varchar`, `NOT NULL` |
| `targetCollection` | `target_collection` | |
| `targetId` | `target_id` | `varchar`, not a foreign key |
| `targetTitle` | `target_title` | Denormalised, so a deleted document still reads |
| `prompt` | `prompt` | The caller's own prompt, from `_meta` |
| `reasoning` | `reasoning` | The caller's stated reasoning, from `_meta` |
| `changesSummary` | `changes_summary` | |
| `summary` | `summary` | `NOT NULL`; generated from the action if the tool passes none |
| `diff` | `diff` | `jsonb`, `{ field: { before, after } }` |
| `success` | `success` | `boolean`, defaults true. **There is no `outcome` column** — and no `'warn'` state. |
| `errorMessage` | `error_message` | Set with `success = false` |
| `approvalRequestId` | `approval_request_id` | |
| `integrationId` | `integration_id` | |

There is no `ip` column, no `before`/`after` pair (that is `diff`), and no
free-form `metadata`.

Indexes exist on `created_at`, `(actor_user_id, created_at)`,
`(target_collection, target_id, created_at)`, `(action, created_at)` and
`(mcp_server, created_at)`. Every query below leads with one of them; a filter
on `target_title` or `error_message` is a sequential scan.

### What actually writes

The action list is a taxonomy, not an inventory, and the difference is what
12 H3 was about. As of this commit:

| Action | Written by |
| --- | --- |
| `content.find` / `.create` / `.update` / `.delete` | **nothing.** Reserved for a payload CRUD server that does not exist; see below |
| `design.suggest` | `components/tools/suggest-for-intent.ts` |
| `design.validate` | `components/tools/validate-composition.ts` |
| `design.find_anti_pattern` | `components/tools/find-anti-pattern.ts` |
| `design.list` / `design.get_contract` | **nothing.** `list_components`, `get_contract`, `get_variants` and `get_tokens` write no row |
| `publishing.publish` / `.unpublish` | `publishing/service.ts` |
| `publishing.schedule` / `.rollback` | those two tools |
| `publishing.draft` | **nothing** |
| `approval.requested` | `approvals/tools/request-approval.ts` |
| `approval.granted` / `.declined` / `.changes_requested` / `.discussed` | `approvals/tools/respond-to-approval.ts` and the email-action endpoint |
| `approval.expired` | `workflows/expire-stale-approvals.ts` — the one cron that writes here |
| `form.created` / `.updated` | the three forms write tools |
| `form.submission_received` | **nothing.** `forms/submit/endpoint.ts` writes no audit row at all; the record of a submission is the document it creates in the submissions collection, plus the Inngest fan-out |
| `integration.synced` / `.failed` | `integrations/plugin.ts` and the webhook integration, with the failure message |
| `system.error` | **every tool in every server, when its handler throws.** See below |
| `system.healthcheck` | **nothing.** The healthcheck's failures go to `onFailure` — see Healthchecks |

Nine of the twenty-seven actions have no writer — ten before this commit gave
`system.error` one. That gap is the difference
between a taxonomy and an inventory and the reason this table exists. The four
`content.*` ones are the ones to understand: `@payloadcms/plugin-mcp` generates
find/create/update/delete tools from a host's field configs, and those are the
plugin's own — they do not pass through this suite's adapter and they write no
audit row. A host that enables them by passing `collections` to `mcpPlugin` is
giving an agent write access to content with no audit trail. `apps/web` passes
none, so none are registered, which is why nothing is missing there yet.

So, positively: publishes, approvals, integration syncs and failures, form
definition changes, three of the seven design queries, and every tool crash.
Not: generic CRUD, frontend requests, form submissions, or healthcheck results.

### `system.error`

`core/src/mcp/payload-mcp.ts` wraps every tool handler the suite serves —
every server, including the four design queries and the five audit reads that
write no row of their own. When one throws, the throw
still propagates, because the MCP client needs the JSON-RPC error, and a row is
written first:

```
action        system.error
mcpServer     the throwing tool's server
mcpTool       the throwing tool's name
success       false
errorMessage  the error's message
actor         whoever called, and their `_meta` prompt and reasoning
```

Three things it deliberately does not record: the stack, because
`error_message` is readable by every admin and editor and a stack names file
paths; the tool's arguments, because a tool's input can carry a draft body or a
form submission; and anything at all when the recording itself fails, which is
logged and swallowed so this wrapper can never replace a tool's real error with
its own.

`mcpServer` comes from a map, not from the server's own name — the components
server declares itself `components` and the enum value is `component`. See
`core/src/mcp/audit-server.ts`; adding a server without a name in that map is a
boot-time refusal rather than a silently dropped row.

**This is not an error tracker.** Nothing reads `audit_events` for alerting:
the only consumers are the five read-side MCP tools and whoever runs the SQL
below, i.e. a human who already suspects something. It records crashes for the
person investigating one. Paging is the host's job — in `apps/web` that is
`instrumentation.ts`.

### Common queries via the Audit MCP

The five read tools are `query_audit`, `get_change_history`,
`who_changed_what`, `what_changed_in_range` and `get_recent_failures`. All five
are admin/editor only.

```
Show me the recent audit events for the About us page.
List all publish failures in the last 24 hours.
Who has approved content in the last week?
What has failed in the last hour?
```

`get_recent_failures` filters `success = false`, which is what makes the
`system.error` rows above worth having: "what has been crashing" is one tool
call rather than a database session.

### Direct database queries

```sql
-- Publish failures in the last day
SELECT created_at, target_collection, target_id, target_title, error_message
FROM audit_events
WHERE action = 'publishing.publish'
  AND success = false
  AND created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC;
```

Note `action = 'publishing.publish'` with `success = false`, not a separate
attempted/failed action. There is no `content.publish_attempted`; the enum's
values are exactly the list above.

### What's NOT in the audit log

- Frontend page renders (use platform analytics)
- Read operations, except `content.find` and the `design.*` reads
- Anything that did not come through an MCP tool — a REST or Local API write,
  the admin UI, a migration, a seed script
- Form submissions (see the table above)
- Healthcheck results (see the table above) — failing ones are in
  [job failures](#job-failures)
- Workflows that ran out of retries — [job failures](#job-failures)
- Inngest function internal step state (use the Inngest dashboard)
- HTTP request logs (use platform logs)

### Retention

By default, audit rows live forever. For high-volume sites, write a cron to age
out:

```typescript
inngest.createFunction(
  { id: 'audit-log-retention' },
  { cron: '0 3 * * *' }, // 3am daily
  async ({ step }) => {
    await step.run('delete-old', async () => {
      await payload.delete({
        collection: 'audit-events',
        where: { createdAt: { less_than: new Date(Date.now() - 365 * 86400000) } },
      })
    })
  },
)
```

The collection denies `delete` to every caller, so this has to run through the
Local API — which bypasses access control — and not through REST.

One year is a sensible default for active operations; one-off compliance use
cases may want longer.

## Job failures

`jobFailuresPlugin` (from `@forumone/throughline-core/observability`) adds a
`job-failures` collection: one row per background job that ran out of retries,
and one per healthcheck run with a failing check. The scaffold registers it.
Admins read it in the admin; nobody can create, edit or delete a row through
the admin or REST — the writer uses the Local API.

Rows are written by the two handlers in `@forumone/throughline-workflows`:

```typescript
import {
  createHealthcheckFailureHandler,
  createTerminalFailureHandler,
} from '@forumone/throughline-workflows'

const onTerminalFailure = createTerminalFailureHandler({ payload })

createExpireStaleApprovalsFunction({ inngest, payload, onTerminalFailure })
createHealthcheckFunction({
  inngest,
  payload,
  checks: [createPayloadReachableCheck()],
  onFailure: createHealthcheckFailureHandler({ payload }),
  onTerminalFailure,
})
```

Each failure goes to three places, in this order, and each works without the
others:

1. **The log** — one `error` line, `[job-failed] <summary>`, with the full
   report (stack included) as context. Always, configured or not.
2. **A `job-failures` row** — if `jobFailuresPlugin` is registered. Without it
   the handler skips the row and does the other two.
3. **The error webhook** — `ERROR_WEBHOOK_URL`, if set. See below.

None of them throws, and neither handler does: an Inngest `onFailure` handler
is itself a function run, and a throw there is retried — a retry storm about
the reporter while the original failure is what nobody sees. A row that cannot
be written (the migration has not run, the database is down) is logged at
`error` with the failure's own summary and message, so it is demoted to the
log rather than lost.

`createTerminalFailureHandler` works as the `onFailure` of any Inngest
function, not just this suite's — it reads `function_id`, `run_id` and the
triggering event's name from Inngest's `function.failed` payload. The
functions the email, forms and integrations plugins build are not given it by
the scaffold; pass it to those yourself if you build them yourself.

### Why not the audit log

The audit log answers "who did what, through which tool"; `mcp_server` and
`mcp_tool` are `NOT NULL` because every row is a tool call. Before this
collection existed a cron had two choices, both bad: borrow a server's name,
which makes those columns lie, or invent one, which Payload rejects — and the
audit writer swallows the rejection by design, so the row silently never
existed. A failed job also has fields the audit log does not (a run id, a
triggering event) and a different lifetime: worth keeping for weeks, where
audit rows are kept indefinitely.

### Schema

| Field | Column | Notes |
| --- | --- | --- |
| `createdAt` | `created_at` | When the failure was reported |
| `kind` | `kind` | `enum_job_failures_kind`: `'job' \| 'healthcheck'` |
| `source` | `source` | The Inngest function id, or the healthcheck's id |
| `summary` | `summary` | `[environment] kind: message — source` |
| `message` | `message` | The error's message; for a healthcheck, the failing check names |
| `errorName` | `error_name` | `TypeError`, etc. |
| `runId` | `run_id` | Inngest's run id — search for it in the dashboard |
| `triggerEvent` | `trigger_event` | The event that started the run |
| `details` | `details` | `jsonb`; a healthcheck's failed checks and what each said |
| `environment` | `environment` | `VERCEL_ENV`, else `NODE_ENV` |
| `commit` | `commit` | `VERCEL_GIT_COMMIT_SHA`, first 12 characters |

No stack: rows are readable in the admin, and a stack names file paths. The
log line and the webhook report carry it.

```sql
-- What has been failing this week, worst first. Uses (source, created_at).
SELECT source, kind, count(*) AS failures, max(created_at) AS most_recent
FROM job_failures
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY source, kind
ORDER BY failures DESC;
```

Retention is the same shape as the audit log's — a cron through the Local API —
and can be much shorter.

## Error reporting

`@forumone/throughline-core/observability` posts error reports to a webhook:
`ERROR_WEBHOOK_URL`, or the `url` you pass to `createErrorReporter`. Which
error tracker a site uses is the site's choice, so this does not pick one —
the receiver can be a log drain, an alerting endpoint, a Slack incoming
webhook, or a small proxy in front of Sentry.

Every report is JSON with a one-line `text` added (`[production] job: … —
expire-stale-approvals`), which is what makes a plain Slack webhook work; other
receivers ignore it. Three kinds are sent: `request` (from `onRequestError`),
`job` and `healthcheck` (from the workflow handlers above).

The scaffold wires the request half in `apps/web/src/instrumentation.ts`:

```typescript
import type { Instrumentation } from 'next'
import { buildRequestErrorReport, reportError } from '@forumone/throughline-core/observability'

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const report = buildRequestErrorReport(error, request, context)
  console.error('[error]', JSON.stringify(report))
  await reportError(report)
}
```

Rules the reporter keeps:

- **It never throws or rejects.** A failed delivery — refused, timed out,
  non-2xx — is logged as a warning and dropped.
- **It gives up after 3 seconds** (`timeoutMs`), shorter than any function
  timeout, so a slow receiver cannot hold a function open.
- **Request headers are an allowlist.** By default `x-request-id`,
  `x-vercel-id`, `user-agent` and `referer`; pass `headers` to
  `buildRequestErrorReport` to change it. `authorization`,
  `proxy-authorization`, `cookie`, `set-cookie`, `x-api-key` and
  `x-forwarded-for` are never copied even if listed — `cookie` carries the
  Payload session. The client address is reduced to a /16 or /64 prefix.
- **Unset is reported.** `describeErrorReporting()` returns a sentence for a
  boot log line, distinguishing off from misconfigured; the scaffold's
  `register()` warns when reports are going nowhere.

To authenticate to the receiver, `createErrorReporter({ webhookHeaders: {
authorization: '…' } })` and pass that reporter as the workflow handlers'
`report` option.

## Inngest dashboard

Every workflow run shows up here. Filter by:

- **Function** — `notify-approval-request`, `pagestore-sync-published`, etc.
- **Status** — running / completed / failed / cancelled
- **Time range** — last hour / day / week
- **Event** — every run is associated with the event that triggered it

Click into a run to see every `step.run` call's inputs and outputs. Failed runs
show stack traces and which step blew up.

Practical patterns:

- **Daily glance**: open the dashboard, filter to "failed" in the last 24 hours, decide which need replay
- **Per-incident triage**: filter to a specific function and time window when investigating
- **Trend watching**: the dashboard's metrics view shows function call rates and error rates over time — alert on sudden changes

The dashboard is the source of truth for "did this workflow actually run?".
A run that ran out of retries is also in [job failures](#job-failures) if the
function was given `createTerminalFailureHandler` — a successful run is
recorded nowhere else.

## Resend delivery logs

Every email Throughline sends goes through Resend. Their dashboard shows:

- Send status (queued / sent / delivered / bounced / complained)
- Per-recipient state (especially useful for fan-out emails like multi-approver requests)
- Open / click tracking (if enabled in plugin options)

When an approver says "I never got the email," check Resend first. Common causes:

- Address typo in the user record
- Email domain not on Resend's verified list (DNS misconfigured)
- Sender domain blocked by recipient's mail provider (rare; surface in DMARC reports)
- Recipient marked an earlier email as spam, breaking subsequent delivery

## What to monitor

A reasonable starting set, with where the signal actually comes from today:

| Signal | Source | Alert when |
| --- | --- | --- |
| Publish failure rate | Audit log — `publishing.publish` with `success = false` | >5% failures in any 1-hour window |
| Tool crash rate | Audit log — `system.error` | any, in a quiet system |
| Email send failure rate | Resend dashboard | any send-failed in the last hour |
| Inngest function failure rate | Inngest dashboard | any function with >1% error rate over 1 hour |
| Workflows out of retries | `job-failures`, and the error webhook | any |
| Healthcheck failures | `job-failures` (`kind = 'healthcheck'`), and the error webhook | any check failing for >2 consecutive runs |
| Unhandled request errors | The error webhook, from `instrumentation.ts` | a burst |
| Approval expiry rate | Audit log — `approval.expired` | a spike, meaning approvers aren't responsive |

Only the error webhook rows push; the rest are reachable by polling, which
means a query on a schedule that somebody has to write. Set `ERROR_WEBHOOK_URL`
and the webhook rows need nothing else.

## Healthchecks

The Workflows package's `createHealthcheckFunction` runs registered checks on a
cron. The framework provides two:

- **`createPayloadReachableCheck(collectionSlug?)`** — confirms Payload is
  responsive by querying a collection. Defaults to `users`.
- **`createManifestReachableCheck(manifestUrl)`** — confirms a URL responds
  2xx to a GET, with a 5-second timeout. Aimed at the design-system manifest.

Both take positional arguments, not an options object.

```typescript
createHealthcheckFunction({
  inngest,
  payload,
  schedule: '*/15 * * * *', // the option is `schedule`, not `cron`
  checks: [
    createPayloadReachableCheck(),
    createManifestReachableCheck(process.env.DS_MANIFEST_URL!),
    {
      name: 'redis',
      run: async () => {
        try {
          await redis.ping()
          return { ok: true }
        } catch (e) {
          return { ok: false, details: String(e) }
        }
      },
    },
  ],
  // Log, a job-failures row, and the error webhook. The default is a bare
  // `console.error`.
  onFailure: createHealthcheckFailureHandler({ payload }),
})
```

**Failing checks do not land in the audit log.** They are passed to
`onFailure`, once per run, with every failed check's name and details.
`createHealthcheckFailureHandler` records them in
[job failures](#job-failures) and reports them; without it, the default is a
`console.error`. The `system.healthcheck` audit action exists in the enum and
nothing writes it.

The function also sends a `system/healthcheck` Inngest event on every run,
failures or not, so an external dashboard can watch for the *absence* of a
heartbeat — which is the failure mode `onFailure` cannot report, because a
function that never ran cannot call it.

## Tracing requests

Throughline doesn't ship distributed tracing. When the audit log, the Inngest
dashboard and platform request logs are not enough:

- **OpenTelemetry**: Payload + Next.js both have OTel instrumentation. Wire your
  collector and you'll get spans across HTTP requests, database queries, and
  outgoing fetches.
- **Vercel Web Analytics / Speed Insights**: built into Vercel; useful for
  frontend performance, less so for API/MCP debugging.

## Useful audit-log lookups (cheat sheet)

Every one of these has been run against the schema above.

```sql
-- All actions by one user today. Uses (actor_user_id, created_at).
SELECT created_at, action, mcp_tool, target_collection, target_id, success
FROM audit_events
WHERE actor_user_id = '<user-id>' AND created_at > CURRENT_DATE
ORDER BY created_at DESC;

-- One document's publish history, successful or not.
-- Uses (target_collection, target_id, created_at).
SELECT created_at, action, actor_user_name, success, error_message
FROM audit_events
WHERE target_collection = 'pages' AND target_id = '<id>'
  AND action LIKE 'publishing.%'
ORDER BY created_at;

-- Integration sync errors in the last hour
SELECT created_at, integration_id, error_message
FROM audit_events
WHERE action = 'integration.failed' AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Everything that crashed in the last hour, worst offenders first
SELECT mcp_server, mcp_tool, error_message, count(*) AS occurrences,
       max(created_at) AS most_recent
FROM audit_events
WHERE action = 'system.error' AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY mcp_server, mcp_tool, error_message
ORDER BY occurrences DESC;

-- Approval response times.
-- Self-join on target, because approval_request_id is only set on some rows.
SELECT
  granted.created_at - requested.created_at AS time_to_decide,
  requested.target_collection,
  requested.target_id
FROM audit_events requested
JOIN audit_events granted
  ON granted.target_collection = requested.target_collection
 AND granted.target_id = requested.target_id
 AND granted.created_at > requested.created_at
WHERE requested.action = 'approval.requested'
  AND granted.action = 'approval.granted'
ORDER BY time_to_decide DESC;

-- One conversation's writes, in order. Returns nothing today: the column is
-- filled from `McpToolContext.sessionId`, and the adapter that builds that
-- context from a `plugin-mcp` request does not set it. Kept because the query
-- is right and the gap is one line in `core/src/mcp/payload-mcp.ts`.
SELECT created_at, action, mcp_tool, summary, success
FROM audit_events
WHERE actor_session_id = '<session-id>'
ORDER BY created_at;
```

Most of these can also be expressed via the Audit MCP, but for one-off
operational queries SQL is faster.

## Where to look in code

- `packages/core/src/audit/types.ts` — the action taxonomy. A name here is not
  a promise that anything writes it; the table above is the inventory.
- `packages/core/src/audit/collection.ts` — the fields, and which are required
- `packages/core/src/audit/writer.ts` — how rows are written, and why a write
  failure is swallowed
- `packages/core/src/mcp/payload-mcp.ts` — the `system.error` wrapper
- `packages/core/src/mcp/audit-server.ts` — collector server name → `mcpServer`
- `packages/audit/src/tools/*.ts` — the five read-side MCP tools
- `packages/workflows/src/healthcheck.ts` — the healthcheck function and its
  two check helpers
- `packages/core/src/observability/collection.ts` — the `job-failures` fields
- `packages/core/src/observability/writer.ts` — report → row, and why it never throws
- `packages/core/src/observability/report.ts` — report shapes, the header
  allowlist, and the webhook reporter
- `packages/workflows/src/failure-handler.ts` — the two failure handlers

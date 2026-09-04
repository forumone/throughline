# Observability

Three places to look when something's wrong, and an honest account of what each
one contains.

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
and it is the convention to follow.

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
- Healthcheck results (see the table above)
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

The dashboard is the source of truth for "did this workflow actually run?" —
and for most functions it is the *only* record, because a workflow writes an
audit row only if it is written to do so, and one is.

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
| Healthcheck failures | **Not the audit log** — whatever you pass as `onFailure` | any check failing for >2 consecutive runs |
| Approval expiry rate | Audit log — `approval.expired` | a spike, meaning approvers aren't responsive |

Nothing in that table alerts on its own. Throughline ships the data; the host
routes it. Two of the rows are only reachable by polling the audit log, which
means a query on a schedule that somebody has to write.

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
  onFailure: async (failures) => {
    // Route this somewhere. The default is `console.error`.
  },
})
```

**Failing checks do not land in the audit log.** They are passed to
`onFailure`, once per run, with every failed check's name and details; the
default implementation is a `console.error` and nothing subscribes to it. The
`system.healthcheck` action exists in the enum and nothing writes it. A
`system.healthcheck.failed` action does not exist at all.

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

# Observability

Three places to look when something's wrong, plus what to add in Phase 2 for fuller coverage.

## The audit log

Every operation that mutates state writes a row to the `audit-log` collection. Schema:

```
{
  id, action, actor, target,
  timestamp, ip,
  before, after,        // state diff
  metadata,             // free-form
  outcome,              // 'success' | 'failure' | 'warn'
}
```

Common queries via the Audit MCP:

```
Show me the recent audit events for the About us page.
List all publish failures in the last 24 hours.
Who has approved content in the last week?
What integrations have failed health checks recently?
```

Direct database queries also work — the collection is just Postgres. Examples:

```sql
-- Publish failures in the last day
SELECT timestamp, target, metadata->>'reason' AS reason
FROM "audit-log"
WHERE action = 'content.publish_attempted'
  AND outcome = 'failure'
  AND timestamp > NOW() - INTERVAL '1 day'
ORDER BY timestamp DESC;
```

The audit log is the single most useful debugging tool. Anything that mutates content, sends email, fires an integration, or runs a cron writes here.

### What's NOT in the audit log

- Frontend page renders (use platform analytics)
- Read operations (only mutations are audited)
- Inngest function internal step state (use the Inngest dashboard)
- HTTP request logs (use platform logs)

### Retention

By default, audit rows live forever. For high-volume sites, write a cron to age out:

```typescript
inngest.createFunction(
  { id: 'audit-log-retention' },
  { cron: '0 3 * * *' }, // 3am daily
  async ({ step }) => {
    await step.run('delete-old', async () => {
      await payload.delete({
        collection: 'audit-log',
        where: { timestamp: { less_than: new Date(Date.now() - 365 * 86400000) } },
      })
    })
  },
)
```

One year is a sensible default for active operations; one-off compliance use cases may want longer.

## Inngest dashboard

Every workflow run shows up here. Filter by:

- **Function** — `notify-approval-request`, `pagestore-sync-published`, etc.
- **Status** — running / completed / failed / cancelled
- **Time range** — last hour / day / week
- **Event** — every run is associated with the event that triggered it

Click into a run to see every `step.run` call's inputs and outputs. Failed runs show stack traces and which step blew up.

Practical patterns:

- **Daily glance**: open the dashboard, filter to "failed" in the last 24 hours, decide which need replay
- **Per-incident triage**: filter to a specific function and time window when investigating
- **Trend watching**: the dashboard's metrics view shows function call rates and error rates over time — alert on sudden changes

The dashboard is the source of truth for "did this workflow actually run?" The audit log records the outcome; the dashboard records the run itself, including retries.

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

A reasonable starting set:

| Signal | Source | Alert when |
| --- | --- | --- |
| Publish failure rate | Audit log | >5% failures in any 1-hour window |
| Email send failure rate | Resend dashboard | Any send-failed in the last hour |
| Inngest function failure rate | Inngest dashboard | Any function with >1% error rate over 1 hour |
| Healthcheck failures | Audit log | Any check failing for >2 consecutive runs |
| Approval expiry rate | Audit log | Sudden spike in `approval.expired` events (means approvers aren't responsive) |

Set up alerting in your platform of choice (Slack incoming webhook, PagerDuty, email). Throughline doesn't ship alerting; it ships the data.

## Healthchecks

The Workflows package's `createHealthcheckFunction` runs registered checks on a cron and writes results to the audit log. The framework provides two:

- **`createPayloadReachableCheck`** — confirms Payload is responsive
- **`createManifestReachableCheck`** — confirms your DS manifest URL responds

Add per-integration healthchecks (each `Integration` has its own `healthcheck` function) and any custom system checks you want monitored.

```typescript
createHealthcheckFunction({
  inngest,
  payload,
  cron: '*/15 * * * *', // every 15 minutes
  checks: [
    createPayloadReachableCheck({ payload }),
    createManifestReachableCheck({ url: process.env.DS_MANIFEST_URL! }),
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
}),
```

Failing checks land in the audit log as `system.healthcheck.failed` events. Combine with the alerting pattern above for paging behavior.

## Tracing requests

Throughline doesn't ship distributed tracing. For most clients, the audit log + Inngest dashboard + platform request logs cover real needs. When that's not enough:

- **OpenTelemetry**: Payload + Next.js both have OTel instrumentation. Wire your collector and you'll get spans across HTTP requests, database queries, and outgoing fetches.
- **Vercel Web Analytics / Speed Insights**: built into Vercel; useful for frontend performance, less so for API/MCP debugging.

Adding OTel is a ~1-day task and is straightforward; it's deferred to Phase 2 for most clients because the audit log generally suffices in early operation.

## Useful audit-log lookups (cheat sheet)

```sql
-- All actions by user X today
SELECT * FROM "audit-log" WHERE actor->>'id' = '<user-id>' AND timestamp > CURRENT_DATE;

-- Page-X publish history (whether successful or rejected)
SELECT * FROM "audit-log" WHERE target->>'collection' = 'pages' AND target->>'id' = '<id>'
  AND action LIKE 'content.publish%' ORDER BY timestamp;

-- Integration sync errors in the last hour
SELECT * FROM "audit-log" WHERE action LIKE 'integration.%' AND outcome = 'failure'
  AND timestamp > NOW() - INTERVAL '1 hour';

-- Approval response times
SELECT
  (granted.timestamp - requested.timestamp) AS time_to_decide,
  requested.target->>'id' AS approval_id
FROM "audit-log" requested
JOIN "audit-log" granted
  ON granted.target->>'id' = requested.target->>'id'
WHERE requested.action = 'approval.requested'
  AND granted.action = 'approval.granted'
ORDER BY time_to_decide;
```

Most of these can also be expressed via the Audit MCP, but for one-off operational queries SQL is faster.

## Where to look in code

- `packages/core/src/audit/types.ts` — full action taxonomy
- `packages/core/src/audit/writer.ts` — how audit rows are written
- `packages/audit/src/tools/*.ts` — the read-side MCP tools
- `packages/workflows/src/healthcheck.ts` — the healthcheck function and check helpers

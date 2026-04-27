# @forumone/throughline-audit

Read-only MCP query tools over the audit log. Pairs with the `auditPlugin` from `@forumone/throughline-core` (which writes records). This package is the read-side surface Claude uses to answer "who changed what, when, and what was the result?"

## Install

```bash
pnpm add @forumone/throughline-audit
```

Peer dependencies: `payload@^3.0.0`. Depends on `@forumone/throughline-core`.

## Public API

```typescript
import {
  auditQueryPlugin,
  formatAuditEvent,
  formatRelativeTime,
  createQueryAuditTool,
  createGetChangeHistoryTool,
  createWhoChangedWhatTool,
  createWhatChangedInRangeTool,
  createGetRecentFailuresTool,
  DEFAULT_AUDIT_COLLECTION_SLUG,
} from '@forumone/throughline-audit'

import type {
  AuditQueryPluginOptions,
  FormattedAuditEvent,
} from '@forumone/throughline-audit'
```

## `auditQueryPlugin(options)`

```typescript
auditQueryPlugin({
  collectionSlug?: string,                   // default 'audit-log'
  readAccess?: AccessFunction,               // default: requires admin/editor/auditor role
  routePrefix?: string,                      // default '/audit'
})
```

The plugin requires the `audit-log` capability (registered by `auditPlugin` in core). If core's audit plugin isn't loaded, this plugin fails to boot.

## MCP tools

| Tool | Required role | Purpose |
| --- | --- | --- |
| `query_audit` | `admin`, `editor`, `auditor` | Free-form query with filters (action, actor, target, time, outcome) |
| `get_change_history` | `admin`, `editor`, `auditor` | All events for a single document (collection + id) ordered by timestamp |
| `who_changed_what` | `admin`, `editor`, `auditor` | Group by actor; "who's been editing recently?" |
| `what_changed_in_range` | `admin`, `editor`, `auditor` | All changes in a time range, optionally filtered by collection |
| `get_recent_failures` | `admin`, `editor`, `auditor` | Recent `outcome: 'failure'` events; useful for dashboard-style prompts |

Each tool returns formatted results via `formatAuditEvent`. The format is JSON with human-readable timestamps and short summaries — not a raw collection dump.

## Formatting helpers

```typescript
import { formatAuditEvent, formatRelativeTime } from '@forumone/throughline-audit'

formatAuditEvent(rawRow)
// {
//   id, action, actor: { name, email },
//   target: { collection, id, title? },
//   timestamp, relativeTime: '3 minutes ago',
//   outcome, summary: 'Ada published "Climate Resilience"',
//   metadata: { /* original */ },
// }

formatRelativeTime(date)  // 'just now' | '2 minutes ago' | 'yesterday' | '3 weeks ago'
```

These are exported separately so you can format audit events outside of the MCP tools — useful for an admin dashboard or a custom email digest.

## Capabilities required

- `audit-log` — must be registered by core's `auditPlugin`. Throws on init if missing.

## Capabilities registered

- `audit-query` — read tools available

## Common usage

```typescript
import { auditPlugin } from '@forumone/throughline-core'
import { auditQueryPlugin } from '@forumone/throughline-audit'

plugins: [
  auditPlugin({ inngest }),         // writes; load first
  auditQueryPlugin(),               // reads; default config is fine
  // ...
]
```

## What the read tools don't do

- They don't paginate every result by default. `query_audit` defaults to a 50-row limit; bump via `limit` parameter or use `what_changed_in_range` with a narrow time window.
- They don't expose the full row diff (`before` / `after`) unless requested. The default formatted result summarizes; pass `verbose: true` to include diffs.
- They don't allow writes. The audit log is append-only by design. Writing happens via core's `getAuditWriter`.

## Common queries via Claude

```
Show me the recent audit events for the About us page.
List all publish failures in the last 24 hours.
Who has approved content in the last week?
What changed yesterday in the programs collection?
Why did the climate-resilience publish fail?
```

For SQL-level queries, see [Observability — useful audit-log lookups](../operations/observability.md#useful-audit-log-lookups-cheat-sheet).

## Related

- Operations: [Observability](../operations/observability.md) — when to query the audit log + cheat sheet
- Reference: [@forumone/throughline-core](core.md) — the writer side

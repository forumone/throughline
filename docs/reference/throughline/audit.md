# Audit queries: `@forumone/throughline/audit`

This was `/audit` in 0.x; [`docs/spec/1.0-exports.md`](../../spec/1.0-exports.md) maps its imports.

Read-only MCP query tools over the Throughline audit log. Pairs with the writer in `@forumone/throughline`: `auditPlugin` writes records, `auditQueryPlugin` exposes them as conversational query tools.

## What this package provides

Five MCP tools, handed to the host's collector at `onInit` and served by
`@payloadcms/plugin-mcp` on one `/api/mcp`. Pass `mcpTools` or they reach nobody.
All are read-only and emit no audit events of their own.

| Tool                    | Use it for                                                                                                | Default access                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `query_audit`           | General-purpose filter (collection, document, actor, action, server, date range, failures)                | admin / editor                             |
| `get_change_history`    | Chronological history of one document, with diffs                                                         | admin / editor                             |
| `who_changed_what`      | A user's recent activity. Defaults to the authenticated caller, so anyone can ask about their own changes | self always; others require admin / editor |
| `what_changed_in_range` | Counts grouped by action / actor / collection / server over a date range                                  | admin / editor                             |
| `get_recent_failures`   | `success=false` events in the last N hours, optionally filtered by server                                 | admin / editor                             |

Each tool returns conversational output: relative times ("2 hours ago"), named actors (`userName` then `apiKeyName` then `system` then `unknown`), and prose summaries.

## Installation

Part of [`@forumone/throughline`](../throughline.md#installation). The audit log itself, `auditPlugin`, is always on under `throughline()`, and the writer is described [there](../throughline.md#the-audit-log). The query tools on this page are on when `auditQuery` is present: `throughline({ auditQuery: {} })`, which gives them the audit log's slug.

## Usage

```ts
export const suite = throughline({
  jobs: inngestJobs(inngest),
  collections: ['pages'],
  auditQuery: {}, // the audit log itself is always on
})
```

The query plugin requires the `audit-log` capability. Registered by hand, without `auditPlugin` first, initialization fails fast with a clear message.

## Why a separate package?

Core writes audit events; this package exposes them. Splitting reads from writes lets clients deploy the writer (which is mandatory) without exposing query tools to MCP clients that don't need them. It also keeps the read-side surface (formatting, access control, paginated tools) out of the core's hot path.

## Why purpose-built tools instead of a raw query?

Raw collection access via Payload MCP would give Claude too much: pagination semantics for conversational UX are wrong, sensitive fields are easy to leak, and raw JSON is harder to relay than formatted prose. The five tools here are bounded — every result set has a default limit and a documented purpose — and the formatted output is what Claude relays directly.

## Access control

- The default predicate (`isAuditReader`) admits `admin` and `editor` roles.
- `who_changed_what` defaults `actorId` to the authenticated caller, so any role can ask about their own activity.
- Looking up another user's activity requires admin / editor.
- Replace the predicate with `readAccess`, which takes the tool's context, if your role model differs:

```ts
throughline({
  // …
  auditQuery: {
    readAccess: (ctx) => ctx.user?.roles.includes('auditor') ?? false,
  },
})
```

## Options

| Option           | Type               | Default         | Notes                                                             |
| ---------------- | ------------------ | --------------- | ----------------------------------------------------------------- |
| `mcpTools`       | `McpToolCollector` | —               | The host's collector. Without it these five tools are unreachable |
| `collectionSlug` | `string`           | `audit-events`  | Must match the slug used by core's `auditPlugin`                  |
| `readAccess`     | `(req) => boolean` | admin / editor  | Custom predicate for read-side access                             |
| `enabled`        | `boolean`          | `true`          | Set to `false` to no-op the plugin                                |
| `logger`         | `Logger`           | `defaultLogger` | Standard Throughline logger                                       |

## Related

- [`@forumone/throughline`](../throughline.md#the-audit-log): the audit collection, writer and event taxonomy
- [Publishing](publishing.md), [Approvals](approvals.md): write the events this surfaces

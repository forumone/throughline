# Phase C8 — Audit Query Server

## Goal

Build `@forumone/claude-cms-audit` — the MCP server that exposes the audit log (already being written by the core package) as conversational query tools. After this phase, Claude can answer questions like "what did I change this week?", "who published the homepage?", "show me every action on this page", or "what integrations failed today?". Small package, high leverage.

## Prerequisites

- C4 complete; audit log collection and writer exist in core
- Core's `auditPlugin` is writing records via sibling plugins' tool calls

## Context

This is the shortest server package in the core. All the heavy lifting happens in C4 — the audit collection, the writer, the `_meta` parameter pattern, Inngest event emission on every write. C8 adds five read-only MCP tools that make the log queryable conversationally.

The design choice is to NOT expose the raw audit collection via Payload MCP. Raw collection access would give Claude too much power (queries could include sensitive fields, pagination semantics are wrong for conversational UX, formatted output is generally better than raw JSON for human consumption). Instead, this package exposes purpose-built tools:

- `query_audit` — general-purpose query with filters
- `get_change_history` — chronological history of a single document
- `who_changed_what` — a user's recent activity
- `what_changed_in_range` — time-bounded summary
- `get_recent_failures` — failed operations surfacing

Each tool returns human-readable output: relative times ("2 hours ago"), named actors (not just IDs), summaries as prose. Claude relays these directly without having to reformat.

Two additional design principles:

- **Access control is strict.** Audit data reveals what users do. Only admins and editors read; regular users can read their own actions via `who_changed_what` scoped to themselves. The plugin options accept an access control function to customize this.
- **Small result sets by default.** Pagination defaults are conservative (20 records). Claude can request more but never gets the whole log in a single call.

## Tasks

### C8.1 — Scaffold the package

```
packages/audit/
├── src/
│   ├── plugin.ts
│   ├── options.ts
│   ├── tools/
│   │   ├── query-audit.ts
│   │   ├── get-change-history.ts
│   │   ├── who-changed-what.ts
│   │   ├── what-changed-in-range.ts
│   │   ├── get-recent-failures.ts
│   │   └── index.ts
│   ├── formatting/
│   │   └── index.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── CHANGELOG.md
```

`package.json` — follows the same shape as C5-C7. Peer dependencies on Payload. Workspace dependencies on core, plugin-contract.

### C8.2 — Define options

`src/options.ts`:

```typescript
import type { BaseCorePluginOptions } from '@forumone/claude-cms-plugin-contract'
import type { PayloadRequest } from 'payload'

export interface AuditPluginOptions extends BaseCorePluginOptions {
  /** Override the audit collection slug. Must match auditPlugin's slug. Default: 'audit-events'. */
  collectionSlug?: string
  /** Custom access control for read operations. Default: admin and editor roles. */
  readAccess?: (req: PayloadRequest) => boolean
}

export function validateOptions(options: AuditPluginOptions): AuditPluginOptions {
  return options
}
```

### C8.3 — Build the formatting helpers

`src/formatting/index.ts`:

```typescript
/**
 * Format an ISO timestamp as a relative time string. Crude but serviceable.
 */
export function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = now - then
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toISOString().slice(0, 10)
}

/**
 * Format an audit event record for conversational output. Strips internal
 * fields, formats dates, names actors, reduces nested objects to simple strings.
 */
export interface FormattedAuditEvent {
  when: string
  who: string
  what: string
  why?: string
  prompt?: string
  diff?: Record<string, { before: unknown; after: unknown }>
  success: boolean
  errorMessage?: string
}

export function formatAuditEvent(raw: Record<string, unknown>): FormattedAuditEvent {
  const actor = raw.actor as Record<string, unknown> | undefined
  const who = actor?.userName ? String(actor.userName) : actor?.type === 'system' ? 'system' : 'unknown'

  return {
    when: formatRelativeTime(String(raw.createdAt)),
    who,
    what: String(raw.summary),
    why: raw.reasoning ? String(raw.reasoning) : undefined,
    prompt: raw.prompt ? String(raw.prompt) : undefined,
    diff: raw.diff as Record<string, { before: unknown; after: unknown }> | undefined,
    success: raw.success !== false,
    errorMessage: raw.errorMessage ? String(raw.errorMessage) : undefined,
  }
}
```

### C8.4 — Build the query tools

`src/tools/query-audit.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import type { Payload } from 'payload'
import { formatAuditEvent } from '../formatting'

export function createQueryAuditTool(deps: { payload: Payload; collectionSlug: string }): McpToolDefinition {
  return {
    name: 'query_audit',
    description:
      "General-purpose audit log query. Filter by collection, document, actor, action type, or date range. Returns chronologically ordered results, most recent first. Use when you need to answer custom questions about system activity.",
    inputSchema: z.object({
      targetCollection: z.string().optional().describe('Filter to a specific collection'),
      targetId: z.string().optional().describe('Filter to a specific document'),
      actorId: z.string().optional().describe('Filter to a specific user'),
      action: z.string().optional().describe('Filter to a specific action type (e.g. "publishing.publish")'),
      dateRange: z
        .object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .optional(),
      limit: z.number().int().positive().max(100).default(20),
      onlyFailures: z.boolean().optional().describe('If true, only return actions that failed'),
    }),
    handler: async (input, ctx) => {
      const conditions: Record<string, unknown>[] = []
      if (input.targetCollection) conditions.push({ targetCollection: { equals: input.targetCollection } })
      if (input.targetId) conditions.push({ targetId: { equals: input.targetId } })
      if (input.actorId) conditions.push({ 'actor.userId': { equals: input.actorId } })
      if (input.action) conditions.push({ action: { equals: input.action } })
      if (input.onlyFailures) conditions.push({ success: { equals: false } })
      if (input.dateRange?.from) conditions.push({ createdAt: { greater_than_equal: input.dateRange.from } })
      if (input.dateRange?.to) conditions.push({ createdAt: { less_than_equal: input.dateRange.to } })

      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        where: conditions.length > 0 ? { and: conditions } : undefined,
        sort: '-createdAt',
        limit: input.limit,
      })

      return {
        total: result.totalDocs,
        events: result.docs.map((doc) => formatAuditEvent(doc as Record<string, unknown>)),
      }
    },
  }
}
```

`src/tools/get-change-history.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import type { Payload } from 'payload'
import { formatAuditEvent } from '../formatting'

export function createGetChangeHistoryTool(deps: { payload: Payload; collectionSlug: string }): McpToolDefinition {
  return {
    name: 'get_change_history',
    description:
      'Returns the complete chronological history of actions on a single document, including full diffs. Use when a user asks "what has happened to this page?" or "who changed X?".',
    inputSchema: z.object({
      targetCollection: z.string(),
      targetId: z.string(),
      limit: z.number().int().positive().max(200).default(50),
    }),
    handler: async (input, ctx) => {
      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        where: {
          and: [
            { targetCollection: { equals: input.targetCollection } },
            { targetId: { equals: input.targetId } },
          ],
        },
        sort: '-createdAt',
        limit: input.limit,
      })

      return {
        targetCollection: input.targetCollection,
        targetId: input.targetId,
        eventCount: result.totalDocs,
        history: result.docs.map((doc) => formatAuditEvent(doc as Record<string, unknown>)),
      }
    },
  }
}
```

`src/tools/who-changed-what.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import type { Payload } from 'payload'
import { formatAuditEvent } from '../formatting'

export function createWhoChangedWhatTool(deps: { payload: Payload; collectionSlug: string }): McpToolDefinition {
  return {
    name: 'who_changed_what',
    description:
      "A user's recent activity. Use when someone asks 'what has Sarah been working on?' or 'show me my changes today'. If actorId is not provided, defaults to the currently authenticated user.",
    inputSchema: z.object({
      actorId: z.string().optional().describe('User ID; defaults to the caller'),
      dateRange: z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() }).optional(),
      limit: z.number().int().positive().max(100).default(25),
    }),
    handler: async (input, ctx) => {
      const actorId = input.actorId ?? ctx.user?.id
      if (!actorId) return { error: 'No actor ID provided and no authenticated user' }

      const conditions: Record<string, unknown>[] = [{ 'actor.userId': { equals: actorId } }]
      if (input.dateRange?.from) conditions.push({ createdAt: { greater_than_equal: input.dateRange.from } })
      if (input.dateRange?.to) conditions.push({ createdAt: { less_than_equal: input.dateRange.to } })

      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        where: { and: conditions },
        sort: '-createdAt',
        limit: input.limit,
      })

      const actorName = result.docs[0]
        ? String((result.docs[0].actor as Record<string, unknown>)?.userName ?? actorId)
        : actorId

      return {
        actor: actorName,
        actionCount: result.totalDocs,
        actions: result.docs.map((doc) => formatAuditEvent(doc as Record<string, unknown>)),
      }
    },
  }
}
```

`src/tools/what-changed-in-range.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import type { Payload } from 'payload'

export function createWhatChangedInRangeTool(deps: { payload: Payload; collectionSlug: string }): McpToolDefinition {
  return {
    name: 'what_changed_in_range',
    description:
      'Summarized activity over a time range, grouped by action type and actor. Use for "what happened last week?" or weekly review questions. Returns counts and top contributors rather than individual events.',
    inputSchema: z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }),
    handler: async (input, ctx) => {
      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        where: {
          and: [
            { createdAt: { greater_than_equal: input.from } },
            { createdAt: { less_than_equal: input.to } },
          ],
        },
        limit: 1000, // Summary tool; higher limit for counting
      })

      const byAction = new Map<string, number>()
      const byActor = new Map<string, { name: string; count: number }>()
      const byCollection = new Map<string, number>()

      for (const doc of result.docs) {
        const raw = doc as Record<string, unknown>
        const action = String(raw.action)
        byAction.set(action, (byAction.get(action) ?? 0) + 1)

        const actor = raw.actor as Record<string, unknown> | undefined
        const actorId = String(actor?.userId ?? actor?.type ?? 'unknown')
        const actorName = String(actor?.userName ?? actorId)
        const existing = byActor.get(actorId)
        byActor.set(actorId, { name: actorName, count: (existing?.count ?? 0) + 1 })

        if (raw.targetCollection) {
          const collection = String(raw.targetCollection)
          byCollection.set(collection, (byCollection.get(collection) ?? 0) + 1)
        }
      }

      return {
        totalActions: result.totalDocs,
        byAction: Object.fromEntries(Array.from(byAction.entries()).sort((a, b) => b[1] - a[1])),
        topActors: Array.from(byActor.entries())
          .map(([id, { name, count }]) => ({ id, name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        byCollection: Object.fromEntries(Array.from(byCollection.entries()).sort((a, b) => b[1] - a[1])),
      }
    },
  }
}
```

`src/tools/get-recent-failures.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import type { Payload } from 'payload'
import { formatAuditEvent } from '../formatting'

export function createGetRecentFailuresTool(deps: { payload: Payload; collectionSlug: string }): McpToolDefinition {
  return {
    name: 'get_recent_failures',
    description:
      'Recent failed operations across all MCP servers. Use for "what broke recently?" or when diagnosing issues. Returns actions with success=false with their error messages.',
    inputSchema: z.object({
      hours: z.number().int().positive().default(24),
      mcpServer: z.string().optional().describe('Filter to a specific server (e.g. "publishing", "integrations")'),
      limit: z.number().int().positive().max(100).default(25),
    }),
    handler: async (input, ctx) => {
      const since = new Date(Date.now() - input.hours * 60 * 60 * 1000).toISOString()
      const conditions: Record<string, unknown>[] = [
        { success: { equals: false } },
        { createdAt: { greater_than_equal: since } },
      ]
      if (input.mcpServer) conditions.push({ mcpServer: { equals: input.mcpServer } })

      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        where: { and: conditions },
        sort: '-createdAt',
        limit: input.limit,
      })

      return {
        hoursScanned: input.hours,
        failureCount: result.totalDocs,
        failures: result.docs.map((doc) => formatAuditEvent(doc as Record<string, unknown>)),
      }
    },
  }
}
```

`src/tools/index.ts`:

```typescript
export { createQueryAuditTool } from './query-audit'
export { createGetChangeHistoryTool } from './get-change-history'
export { createWhoChangedWhatTool } from './who-changed-what'
export { createWhatChangedInRangeTool } from './what-changed-in-range'
export { createGetRecentFailuresTool } from './get-recent-failures'
```

### C8.5 — Build the plugin

`src/plugin.ts`:

```typescript
import type { CorePlugin } from '@forumone/claude-cms-plugin-contract'
import { getPluginRegistry } from '@forumone/claude-cms-plugin-contract'
import { createMcpHandler, createNamedLogger } from '@forumone/claude-cms-core'
import { validateOptions, type AuditPluginOptions } from './options'
import {
  createQueryAuditTool,
  createGetChangeHistoryTool,
  createWhoChangedWhatTool,
  createWhatChangedInRangeTool,
  createGetRecentFailuresTool,
} from './tools'

export const auditQueryPlugin: CorePlugin<AuditPluginOptions> = (rawOptions) => (incomingConfig) => {
  if (rawOptions.enabled === false) return incomingConfig

  const options = validateOptions(rawOptions)
  const routePrefix = options.routePrefix ?? '/api/audit'
  const collectionSlug = options.collectionSlug ?? 'audit-events'
  const logger = createNamedLogger('audit-query', options.logger)

  return {
    ...incomingConfig,
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      {
        path: `${routePrefix}/mcp`,
        method: 'post',
        handler: async (req) => {
          const handler = (req.payload as unknown as Record<symbol, unknown>)[MCP_HANDLER_SYMBOL] as
            | ((r: Request) => Promise<Response>) | undefined
          if (!handler) {
            return new Response(JSON.stringify({ error: 'Audit MCP not initialized' }), {
              status: 503,
              headers: { 'content-type': 'application/json' },
            })
          }
          return handler(req as unknown as Request)
        },
      },
    ],
    onInit: async (payload) => {
      if (incomingConfig.onInit) await incomingConfig.onInit(payload)

      const registry = getPluginRegistry(payload)
      registry.requireCapability('audit-log', '@forumone/claude-cms-audit')

      const deps = { payload, collectionSlug }
      const tools = [
        createQueryAuditTool(deps),
        createGetChangeHistoryTool(deps),
        createWhoChangedWhatTool(deps),
        createWhatChangedInRangeTool(deps),
        createGetRecentFailuresTool(deps),
      ]

      const handler = createMcpHandler({
        payload,
        serverName: 'audit',
        tools,
        logger: { info: logger.info, error: logger.error },
      })

      Object.defineProperty(payload as object, MCP_HANDLER_SYMBOL, {
        value: handler,
        enumerable: false,
        writable: false,
      })

      registry.register({
        id: '@forumone/claude-cms-audit',
        version: '0.1.0',
        capabilities: ['audit-query'],
      })

      logger.info('Audit query server ready')
    },
  }
}

const MCP_HANDLER_SYMBOL = Symbol.for('@forumone/claude-cms/audit-mcp-handler')
```

Note: named `auditQueryPlugin` to avoid confusion with core's `auditPlugin` (which writes). Clients use both.

### C8.6 — Index, tests, README, changeset

`src/index.ts`:

```typescript
export { auditQueryPlugin } from './plugin'
export type { AuditPluginOptions } from './options'
export { formatAuditEvent, formatRelativeTime } from './formatting'
```

Tests for: each query tool with representative data, formatting helpers (edge cases in relative time), access control on the handler.

README explains the package's relationship to core's writer:

> This package adds read-only MCP tools over the audit log. The audit log itself — collection, writer, event hooks — is part of `@forumone/claude-cms-core` and gets installed via `auditPlugin`. Install both: `auditPlugin` writes records, `auditQueryPlugin` exposes them as conversational query tools.

Changeset:

> Initial release. Five read-only MCP tools over the audit log: query_audit, get_change_history, who_changed_what, what_changed_in_range, get_recent_failures. Results are formatted for conversational output with relative times and named actors.

## Acceptance criteria

- [ ] All five query tools work against a populated audit log
- [ ] Formatting produces human-readable output (relative times, named actors)
- [ ] Plugin requires audit-log capability; fails at init if core auditPlugin isn't registered
- [ ] Claude can answer "what did I change today?" using who_changed_what
- [ ] Claude can answer "show me changes to the homepage" using get_change_history
- [ ] Claude can answer "what failed recently?" using get_recent_failures
- [ ] Test coverage 80%+

## Notes for Claude Code

- This is the shortest server package — probably a quarter of C5's size. Don't invent reasons to make it longer. The value is in the tool descriptions (which Claude relies on to choose the right tool) and the formatting (which makes output conversational).
- Naming: package is `@forumone/claude-cms-audit`, export is `auditQueryPlugin`. The "query" disambiguation matters because core's `auditPlugin` is what writes; this reads. Document this in the README.
- The `who_changed_what` tool defaulting to the authenticated user is a small UX improvement but matters a lot in practice. "What did I change today?" should not require the user to know or provide their ID.
- `what_changed_in_range` uses a higher limit (1000 docs for counting). This is fine because it only uses counts, not individual events. If the date range is wide and the log is large, this could be slow — add a warning to the description if Claude is likely to hit this.
- Don't add MCP tools that expose raw queries or unrestricted pagination. Every tool has a bounded result set and a specific purpose. This is a design choice; resist the urge to add a "catch-all" tool.
- Commit after tools (C8.4), plugin (C8.5), and tests.

## What's next

Phase C9 builds the Integrations Server — the extensibility layer for connecting to external systems. This is the last of the five server packages. After C9, we have the complete set of MCP servers.

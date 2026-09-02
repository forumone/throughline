# @forumone/throughline-core

Foundation for the Throughline framework: the audit log, MCP authentication and handler, the event taxonomy, the Inngest client factory, env helpers, a small logger, and shared utilities. Every Throughline plugin depends on this package.

## Install

```bash
pnpm add @forumone/throughline-core
```

Peer dependency: `payload@^3.0.0`.

## Subpath exports

```typescript
import { auditPlugin, createMcpToolCollector } from '@forumone/throughline-core'

// or
import { auditPlugin } from '@forumone/throughline-core/audit'
import { createInngestClient } from '@forumone/throughline-core/events'
import { createMcpToolCollector } from '@forumone/throughline-core/mcp'
import { validateBaseEnv } from '@forumone/throughline-core/env'
```

The package's main entry re-exports everything; subpath imports are useful for tree-shaking and documenting the dependency surface explicitly.

## Audit subsystem

```typescript
import {
  auditPlugin,
  createAuditCollection,
  createAuditWriter,
  getAuditWriter,
  AUDIT_ACTIONS,
} from '@forumone/throughline-core'
```

| Symbol | Purpose |
| --- | --- |
| `auditPlugin(options)` | Payload plugin that creates the `audit-log` collection and installs `_status`-blocking hooks |
| `createAuditCollection(options)` | Returns the `CollectionConfig` for the audit log; usually you let `auditPlugin` create it |
| `createAuditWriter(payload, options)` | Builder for an `AuditWriter` you can call from custom code |
| `getAuditWriter(payload)` | Looks up the writer attached by `auditPlugin` |
| `AUDIT_ACTIONS` | The canonical taxonomy of action strings (`content.created`, `approval.granted`, etc.) |

`AuditPluginOptions`:

```typescript
interface AuditPluginOptions {
  inngest?: InngestClient   // optional; if omitted, no events are fired
  collectionSlug?: string   // default 'audit-log'
  retainFields?: string[]   // for diff before/after computation
}
```

## Auth

There is no auth subsystem here any more. This package used to mint and store MCP
keys — a `mcp-api-keys` collection, a bearer-token authenticator, `generateApiKey` —
and serve them to a JSON-RPC handler of its own. `@payloadcms/plugin-mcp` owns keys
and authentication now, on its own `payload-mcp-api-keys` collection, and the host
registers it.

`sha256Hex(input)` survived the deletion and is exported from
`@forumone/throughline-core/utils`. `documentContentHash` is its caller.

## MCP: handing tools to Payload's server

```typescript
import { createMcpToolCollector } from '@forumone/throughline-core'
import { mcpPlugin } from '@payloadcms/plugin-mcp'

const mcpTools = createMcpToolCollector()

plugins: [
  publishingPlugin({ /* … */ mcpTools }),
  approvalsPlugin({ /* … */ mcpTools }),
  mcpPlugin({ mcp: { tools: mcpTools.tools } }),
]
```

One endpoint — `POST /api/mcp` — for every plugin's tools.

**The plugin reads that array at two different moments, for two different things.**
Once while the config is being built, to generate a per-key checkbox per tool on
its key collection; and again inside the handler it builds *per request*, to serve
them. So a server does two things:

- **declares** its tools' names and descriptions as the config is built. Neither
  needs a Payload, and this is what the checkboxes are generated from
- **binds** their handlers at `onInit`, which is the earliest they can exist,
  since each closes over `payload`, the publishing service or the manifest loader

Both happen inside the plugin. A host passes `mcpTools` and nothing else.

**Order in the plugins array is load-bearing.** Every tool-bearing server must come
before `mcpPlugin`, or it declares into an array that has already been read — and
its tools get no checkbox, which means they are denied to every key with no error
anywhere.

**Hand over the array itself.** A spread or a `.slice()` at config time hands over
something nobody fills.

| Symbol | Purpose |
| --- | --- |
| `createMcpToolCollector(options)` | The array to give `mcpPlugin`, plus `declare()` and `add()` for plugins. Refuses two tools with one name |
| `collector.unbound` | Tools declared and never bound. Empty once every server has initialised |
| `toPayloadMcpTool` / `toPayloadMcpTools` | The adapter from an `McpToolDefinition` to the shape `mcpPlugin` takes. `add()` applies it for you |
| `McpMetaSchema` / `withMeta` | The `_meta` envelope tools use to carry a session id and actor |

Mismatches are refused rather than absorbed. A tool built but never declared throws
at `onInit`, because it would otherwise be denied to every key silently; a tool
declared but never bound stays advertised with a handler that says so.

**A plugin given no collector serves no tools at all.** Each used to mount its own
`/<prefix>/mcp` as a fallback; those are deleted, so an unwired plugin's tools are
unreachable — with no error, because nothing is misconfigured from Payload's side.

**`requiredScope` is declared and read by nothing.** Enforcement is the per-key
checkbox. The declarations record which tools are consequential — they are the
mapping a scope-aware default would be built from — and are deliberately kept
rather than deleted with the handler that used to read them.

## Inngest client

```typescript
import { createInngestClient } from '@forumone/throughline-core'

const inngest = createInngestClient({ id: 'my-site' })
```

Returns a typed Inngest client. The `CoreEvents` / `FrameworkEvents` types provide autocomplete for `inngest.send(...)`.

## Env helpers

```typescript
import { validateBaseEnv, requireEnv, optionalEnv } from '@forumone/throughline-core'

// At app boot:
validateBaseEnv()  // throws if any required var is missing or malformed

// Or one-off:
const apiKey = requireEnv('STRIPE_API_KEY')
const optional = optionalEnv('OPTIONAL_FLAG')
```

`validateBaseEnv` validates the variables Throughline core depends on. For your own variables, use `requireEnv` / `optionalEnv` or write a thin wrapper module — see [Environment variables](../operations/environment-variables.md).

## Logger

A minimal structured logger:

```typescript
import { defaultLogger, createNamedLogger } from '@forumone/throughline-core'

const log = createNamedLogger('publishing.pipeline')
log.info('publish started', { collection: 'pages', id: 'abc' })
log.warn('field outside acceptable range', { field: 'seo.description' })
log.error('publish failed', { stage: 'approval', reason: 'missing-approval' })
```

Outputs structured JSON. Pipe to your platform's log collector.

## Utilities

```typescript
import { shallowDiff, generateId } from '@forumone/throughline-core'
```

- `shallowDiff(a, b)` — used by the audit writer to compute `before`/`after` diffs
- `generateId()` — id generator (currently nanoid)

## Re-exported plugin contract types

For convenience:

```typescript
import type {
  AuthenticatedUser,
  CorePlugin,
  Logger,
  McpToolContext,
  McpToolDefinition,
  PluginRegistry,
} from '@forumone/throughline-core'
```

These also live in `@forumone/throughline-plugin-contract` (see [its reference](plugin-contract.md)). Importing from `core` saves you a separate dependency.

## Common usage

```typescript
import {
  auditPlugin,
  createInngestClient,
  createMcpToolCollector,
} from '@forumone/throughline-core'
import { mcpPlugin } from '@payloadcms/plugin-mcp'

const inngest = createInngestClient({ id: 'my-site' })
const mcpTools = createMcpToolCollector()

export default buildConfig({
  collections: [
    /* your collections */
  ],
  plugins: [
    // auditPlugin first: every other Throughline plugin requires the
    // `audit-log` capability at init and refuses to load without it.
    auditPlugin({ inngest }),
    /* other Throughline plugins, each given `mcpTools` */
    // After them, so every plugin has contributed by the time it is read.
    mcpPlugin({ mcp: { tools: mcpTools.tools } }),
  ],
  /* ... */
})
```

## Related

- Concepts: [Architecture overview](../concepts/architecture-overview.md), [Plugin composition](../concepts/plugin-composition.md), [Event-driven workflows](../concepts/event-driven-workflows.md)
- Operations: [Environment variables](../operations/environment-variables.md), [Observability](../operations/observability.md)

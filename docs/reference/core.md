# @forumone/throughline-core

Foundation for the Throughline framework: the audit log, MCP authentication and handler, the event taxonomy, the Inngest client factory, env helpers, a small logger, and shared utilities. Every Throughline plugin depends on this package.

## Install

```bash
pnpm add @forumone/throughline-core
```

Peer dependency: `payload@^3.0.0`.

## Subpath exports

```typescript
import { auditPlugin, createApiKeysCollection } from '@forumone/throughline-core'

// or
import { auditPlugin } from '@forumone/throughline-core/audit'
import { createApiKeysCollection } from '@forumone/throughline-core/auth'
import { createInngestClient } from '@forumone/throughline-core/events'
import { createMcpHandler } from '@forumone/throughline-core/mcp'
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

## Auth subsystem

```typescript
import {
  createApiKeysCollection,
  createBearerTokenAuthenticator,
  generateApiKey,
} from '@forumone/throughline-core'
```

| Symbol | Purpose |
| --- | --- |
| `createApiKeysCollection(options)` | Returns the `CollectionConfig` for `api-keys` (Bearer tokens used by MCP endpoints) |
| `createBearerTokenAuthenticator(options)` | Returns a function that validates a Bearer token against the collection |
| `generateApiKey(length?)` | Generates a high-entropy random key (default 48 bytes, base64) |
| `sha256Hex(input)` | SHA-256 hex digest helper |

The Bearer authenticator is what each MCP plugin's request handler delegates to. You shouldn't usually call it directly; the framework wires it.

## MCP handler

```typescript
import { createMcpHandler, McpMetaSchema } from '@forumone/throughline-core'
```

`createMcpHandler({ tools, authenticator, logger })` returns a Next.js / Payload-compatible request handler that:

- Verifies the Bearer token
- Parses the JSON-RPC envelope
- Dispatches to a tool by name
- Validates input against the tool's Zod schema
- Returns a structured response (or a typed error)

You only call this if you're writing a new MCP server. Each Throughline plugin (`components`, `publishing`, etc.) calls it internally with its own tool list.

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
  createApiKeysCollection,
  createInngestClient,
} from '@forumone/throughline-core'

const inngest = createInngestClient({ id: 'my-site' })

export default buildConfig({
  collections: [
    /* your collections */,
    createApiKeysCollection(),
  ],
  plugins: [
    auditPlugin({ inngest }),
    /* other Throughline plugins */
  ],
  /* ... */
})
```

## Related

- Concepts: [Architecture overview](../concepts/architecture-overview.md), [Plugin composition](../concepts/plugin-composition.md), [Event-driven workflows](../concepts/event-driven-workflows.md)
- Operations: [Environment variables](../operations/environment-variables.md), [Observability](../operations/observability.md)

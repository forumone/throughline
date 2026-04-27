# @forumone/throughline-core

The shared plumbing every Throughline server package depends on. Drop it into a Payload + Next.js app and you get the audit log, MCP authentication and request handling, the framework event taxonomy + Inngest client factory, env-var conventions, a logger, and a handful of small utilities.

## What's inside

| Subsystem | Subpath | Role |
|---|---|---|
| Audit | `./audit` | `auditPlugin`, `createAuditCollection`, `createAuditWriter`, `getAuditWriter`, `AUDIT_ACTIONS`, `AUDIT_MCP_SERVERS` |
| Auth | `./auth` | `createApiKeysCollection`, `createBearerTokenAuthenticator`, `generateApiKey`, `sha256Hex` |
| Events | `./events` | `createInngestClient`, `CoreEvents`, `FrameworkEvents` (module-augmentation seam) |
| MCP | `./mcp` | `createMcpHandler`, `McpMetaSchema`, `withMeta` |
| Env | `./env` | `ENV_VARS`, `validateBaseEnv`, `requireEnv`, `optionalEnv` |
| Logger | (main) | `defaultLogger`, `createNamedLogger` |
| Utils | (main) | `shallowDiff`, `generateId` |

The main entry re-exports everything; the subpath exports keep bundles smaller for consumers who only need one slice.

## Installation

```bash
pnpm add @forumone/throughline-core
```

Peers: `payload@^3.0.0` and `inngest@^4.0.0`.

## The audit log

Every consequential action in the framework writes to a single immutable Payload collection. Plugins do not write directly — they call the writer attached to the Payload instance by `auditPlugin`.

```ts
import { auditPlugin, createInngestClient } from '@forumone/throughline-core'
import { buildConfig } from 'payload'

const inngest = createInngestClient({ id: 'my-site' })

export default buildConfig({
  // collections, db, secret...
  plugins: [
    auditPlugin({ inngest }),
    // your other Throughline plugins
  ],
})
```

In a downstream plugin's `onInit`:

```ts
import { getAuditWriter } from '@forumone/throughline-core'

onInit: async (payload) => {
  const writer = getAuditWriter(payload)
  await writer({
    actor: { type: 'user', userId: 'u1' },
    action: 'publishing.publish',
    mcpServer: 'publishing',
    mcpTool: 'publishing.publish',
    targetCollection: 'pages',
    targetId: 'p1',
    targetTitle: 'Homepage',
  })
}
```

The writer is **fire-and-forget**: failures log but never throw. Audit failures must never break the originating action.

## MCP authentication

`createApiKeysCollection` adds a Payload collection that stores SHA-256 hashes of bearer tokens (the raw key is shown to the operator once on create, then never persisted). `createBearerTokenAuthenticator` validates incoming requests against that collection.

```ts
import { createApiKeysCollection, createBearerTokenAuthenticator, createMcpHandler } from '@forumone/throughline-core'
import type { Payload } from 'payload'

// In your Payload config:
collections: [createApiKeysCollection({ usersSlug: 'users' })],

// In your MCP route:
const authenticator = createBearerTokenAuthenticator({ payload })
const handleMcp = createMcpHandler({
  payload,
  serverName: 'publishing',
  tools: [/* McpToolDefinition[] */],
  authenticator,
})

// Next.js app router:
export const POST = (req: Request) => handleMcp(req)
```

## Events

`CoreEvents` enumerates the events the framework fires today. Server packages add their own via TypeScript module augmentation:

```ts
declare module '@forumone/throughline-core/events' {
  interface FrameworkEvents {
    'approval/decided': {
      data: { approvalId: string; decision: 'granted' | 'declined' }
    }
  }
}
```

After augmentation, `inngest.send({ name: 'approval/decided', data: { ... } })` is type-checked everywhere.

## Env vars

`ENV_VARS` is the canonical list of names the framework reads. Plugins reach into `process.env` through these constants rather than hard-coded strings:

```ts
import { ENV_VARS, requireEnv, validateBaseEnv } from '@forumone/throughline-core'

validateBaseEnv() // throws on missing PAYLOAD_SECRET / DATABASE_URI / NEXT_PUBLIC_SERVER_URL

const apiKey = requireEnv(ENV_VARS.PUBLISHING_SERVER_API_KEY)
```

## Why all of this lives in one package

Server packages (Component, Publishing, Approvals, Audit Query, Forms, Integrations) all depend on the same audit log, the same authentication pattern, and the same event taxonomy. Splitting these across packages would create circular dependencies — every server package would need the audit writer, and an audit-only package would need to know about every server. Consolidating the plumbing here keeps the dependency graph one-way: core → server packages → client app.

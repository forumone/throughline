# Phase C4 — Core Plumbing Package

## Goal

Build `@forumone/claude-cms-core` — the foundation every server package depends on. Contains: the audit log (collection + writer + query helpers), the MCP authentication pattern, shared types beyond the plugin contract, the Inngest client factory, standard env var handling, common utilities, and the `_meta` parameter convention. After this phase, the five server packages (C5-C9) can be developed in parallel because they all build on the same plumbing.

## Prerequisites

- C0 complete; monorepo and publishing pipeline operational
- C1 complete; plugin contract package exists
- C2 complete; design contract package published

## Context

This package is the "standard library" for the framework. Everything that's shared across multiple server packages lives here. The guiding principle is **extract what's shared, keep everything else in its package**. If only one package uses a utility, it stays in that package. If two or more packages use it, it lives in core.

The audit log is the biggest piece. It's shared infrastructure because every action anywhere in the system writes to it, and every query tool reads from it. Putting the audit log in its own package (C8) would create a circular dependency risk (every server package needs the audit log; an audit-only package would need to reference every server). So the audit *writer* and the *collection* live in core; the audit *query MCP server* lives in C8.

A few design principles for this phase:

- **Take dependencies, don't make them.** Core depends on plugin-contract and design-contract. Server packages depend on core. Core does not depend on any server package. This one-way dependency flow is the key to the architecture.
- **Payload plugin shape even for small things.** The audit log is delivered as `auditPlugin({ options })` — not as a loose collection or a helper. Consistency matters more than convenience here.
- **Opinionated defaults.** Env var names, route prefixes, collection slugs, event names — pick values and document them. Clients can override, but defaults should just work.
- **Events are the integration seam.** Actions fire Inngest events. Side effects subscribe to events. Core defines the event taxonomy and the client factory; individual server packages add events to the taxonomy.

## Tasks

### C4.1 — Scaffold the package

Create `packages/core/`:

```
packages/core/
├── src/
│   ├── audit/
│   │   ├── collection.ts
│   │   ├── writer.ts
│   │   ├── plugin.ts
│   │   └── types.ts
│   ├── auth/
│   │   ├── authenticator.ts
│   │   └── api-keys.ts
│   ├── events/
│   │   ├── taxonomy.ts
│   │   └── inngest.ts
│   ├── mcp/
│   │   ├── handler.ts
│   │   ├── server.ts
│   │   └── meta.ts
│   ├── env/
│   │   └── index.ts
│   ├── logger/
│   │   └── index.ts
│   ├── registry/
│   │   └── index.ts
│   ├── utils/
│   │   ├── diff.ts
│   │   ├── id.ts
│   │   └── index.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── CHANGELOG.md
```

`package.json`:

```json
{
  "name": "@forumone/claude-cms-core",
  "version": "0.1.0",
  "description": "Core plumbing for the Claude-First CMS framework: audit log, authentication, events, MCP server infrastructure, shared utilities.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./audit": {
      "types": "./dist/audit/index.d.ts",
      "default": "./dist/audit/index.js"
    },
    "./events": {
      "types": "./dist/events/index.d.ts",
      "default": "./dist/events/index.js"
    },
    "./mcp": {
      "types": "./dist/mcp/index.d.ts",
      "default": "./dist/mcp/index.js"
    }
  },
  "files": ["dist", "README.md", "CHANGELOG.md"],
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b -w",
    "clean": "rm -rf dist .turbo",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "keywords": ["claude-cms", "payload", "mcp"],
  "license": "MIT",
  "peerDependencies": {
    "payload": "^3.0.0",
    "inngest": "^3.0.0"
  },
  "dependencies": {
    "@forumone/claude-cms-plugin-contract": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-eslint-config": "workspace:*",
    "inngest": "^3.0.0",
    "payload": "^3.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

### C4.2 — Build the audit collection

`src/audit/collection.ts`:

```typescript
import type { CollectionConfig } from 'payload'

const AUDIT_ACTIONS = [
  'content.find',
  'content.create',
  'content.update',
  'content.delete',
  'design.list',
  'design.suggest',
  'design.validate',
  'design.get_contract',
  'design.find_anti_pattern',
  'publishing.draft',
  'publishing.publish',
  'publishing.unpublish',
  'publishing.schedule',
  'publishing.rollback',
  'approval.requested',
  'approval.granted',
  'approval.declined',
  'approval.changes_requested',
  'approval.expired',
  'approval.discussed',
  'form.created',
  'form.submission_received',
  'integration.synced',
  'integration.failed',
  'system.error',
  'system.healthcheck',
] as const

export const AUDIT_MCP_SERVERS = [
  'payload',
  'component',
  'publishing',
  'approvals',
  'audit',
  'forms',
  'integrations',
] as const

export interface AuditCollectionOptions {
  /** Override the collection slug. Default: 'audit-events' */
  slug?: string
  /** Override the access control function for reads. Default: admin and editor roles. */
  readAccess?: CollectionConfig['access']['read']
}

export function createAuditCollection(options: AuditCollectionOptions = {}): CollectionConfig {
  const slug = options.slug ?? 'audit-events'

  return {
    slug,
    admin: {
      useAsTitle: 'summary',
      defaultColumns: ['createdAt', 'actor', 'action', 'targetCollection', 'targetId'],
      description:
        'Immutable record of every consequential action in the system. Read-only through the admin.',
    },
    access: {
      read: options.readAccess ?? (({ req }) => {
        const roles = (req.user?.roles as string[] | undefined) ?? []
        return roles.includes('admin') || roles.includes('editor')
      }),
      create: () => false, // system-only writes
      update: () => false, // immutable
      delete: () => false, // immutable
    },
    fields: [
      {
        name: 'createdAt',
        type: 'date',
        required: true,
        defaultValue: () => new Date().toISOString(),
        admin: { position: 'sidebar', readOnly: true },
      },
      {
        name: 'actor',
        type: 'group',
        fields: [
          {
            name: 'type',
            type: 'select',
            options: [
              { label: 'User', value: 'user' },
              { label: 'System', value: 'system' },
              { label: 'Integration', value: 'integration' },
            ],
            required: true,
          },
          { name: 'userId', type: 'text' },
          { name: 'userName', type: 'text' },
          { name: 'apiKeyName', type: 'text' },
          { name: 'apiKeyId', type: 'text' },
          { name: 'sessionId', type: 'text' },
        ],
      },
      {
        name: 'action',
        type: 'select',
        options: AUDIT_ACTIONS.map((a) => ({ label: a, value: a })),
        required: true,
      },
      {
        name: 'mcpServer',
        type: 'select',
        options: AUDIT_MCP_SERVERS.map((s) => ({ label: s, value: s })),
        required: true,
      },
      { name: 'mcpTool', type: 'text', required: true },
      { name: 'targetCollection', type: 'text' },
      { name: 'targetId', type: 'text' },
      { name: 'targetTitle', type: 'text' },
      {
        name: 'prompt',
        type: 'textarea',
        admin: { description: "The user's natural-language prompt, if captured via _meta." },
      },
      {
        name: 'reasoning',
        type: 'textarea',
        admin: { description: "Claude's reasoning, if surfaced via _meta." },
      },
      { name: 'changesSummary', type: 'textarea' },
      { name: 'summary', type: 'text', required: true },
      {
        name: 'diff',
        type: 'json',
        admin: { description: 'Before/after fields for update operations; null for reads.' },
      },
      { name: 'success', type: 'checkbox', defaultValue: true },
      { name: 'errorMessage', type: 'text' },
      { name: 'approvalRequestId', type: 'text' },
      { name: 'integrationId', type: 'text' },
    ],
    indexes: [
      { fields: ['createdAt'] },
      { fields: ['actor.userId', 'createdAt'] },
      { fields: ['targetCollection', 'targetId', 'createdAt'] },
      { fields: ['action', 'createdAt'] },
      { fields: ['mcpServer', 'createdAt'] },
    ],
    timestamps: false, // we manage createdAt ourselves for precision
  }
}
```

### C4.3 — Build the audit writer

`src/audit/writer.ts`:

```typescript
import type { Payload } from 'payload'
import type { Inngest } from 'inngest'
import type { AuditAction, AuditMcpServer } from './types'

export interface AuditEventInput {
  actor: {
    type: 'user' | 'system' | 'integration'
    userId?: string | undefined
    userName?: string | undefined
    apiKeyName?: string | undefined
    apiKeyId?: string | undefined
    sessionId?: string | undefined
  }
  action: AuditAction
  mcpServer: AuditMcpServer
  mcpTool: string
  targetCollection?: string | undefined
  targetId?: string | undefined
  targetTitle?: string | undefined
  prompt?: string | undefined
  reasoning?: string | undefined
  changesSummary?: string | undefined
  summary?: string | undefined
  diff?: Record<string, { before: unknown; after: unknown }> | null | undefined
  success?: boolean | undefined
  errorMessage?: string | undefined
  approvalRequestId?: string | undefined
  integrationId?: string | undefined
}

export interface AuditWriterOptions {
  payload: Payload
  inngest?: Inngest | undefined
  collectionSlug?: string | undefined
  logger?: { warn: (m: string, c?: unknown) => void; error: (m: string, c?: unknown) => void } | undefined
}

/**
 * Creates a function that writes audit events. The writer is fire-and-forget
 * from the perspective of the caller: audit failures log but never throw.
 * The audit pipeline must never block or break the original action.
 */
export function createAuditWriter(options: AuditWriterOptions) {
  const { payload, inngest, collectionSlug = 'audit-events', logger } = options

  return async function recordAuditEvent(event: AuditEventInput): Promise<void> {
    try {
      const summary = event.summary ?? generateSummary(event)

      const created = await payload.create({
        collection: collectionSlug,
        data: {
          createdAt: new Date().toISOString(),
          actor: event.actor,
          action: event.action,
          mcpServer: event.mcpServer,
          mcpTool: event.mcpTool,
          targetCollection: event.targetCollection,
          targetId: event.targetId,
          targetTitle: event.targetTitle,
          prompt: event.prompt,
          reasoning: event.reasoning,
          changesSummary: event.changesSummary,
          summary,
          diff: event.diff ?? null,
          success: event.success ?? true,
          errorMessage: event.errorMessage,
          approvalRequestId: event.approvalRequestId,
          integrationId: event.integrationId,
        },
      })

      // Fire an Inngest event so subscribers can react.
      if (inngest) {
        try {
          await inngest.send({
            name: 'audit/event.recorded',
            data: {
              auditEventId: String(created.id),
              action: event.action,
              actorId: event.actor.userId,
              targetCollection: event.targetCollection,
              targetId: event.targetId,
              approvalRequestId: event.approvalRequestId,
              integrationId: event.integrationId,
            },
          })
        } catch (eventError) {
          logger?.warn('Audit Inngest event send failed', { error: eventError })
        }
      }
    } catch (writeError) {
      logger?.error('Audit event write failed', { error: writeError, event })
      // Intentionally swallow. Audit failures must not break the original action.
    }
  }
}

const SUMMARY_TEMPLATES: Partial<Record<AuditAction, (e: AuditEventInput) => string>> = {
  'content.update': (e) => `Updated ${e.targetTitle ?? e.targetId} in ${e.targetCollection}`,
  'content.create': (e) => `Created ${e.targetTitle ?? e.targetId} in ${e.targetCollection}`,
  'content.delete': (e) => `Deleted ${e.targetTitle ?? e.targetId} from ${e.targetCollection}`,
  'content.find': (e) => `Queried ${e.targetCollection}`,
  'design.suggest': (e) => `Searched for components matching: ${e.prompt?.slice(0, 80) ?? 'an intent'}`,
  'design.validate': () => 'Validated a composition',
  'design.get_contract': (e) => `Fetched contract for ${e.targetTitle ?? 'a component'}`,
  'publishing.publish': (e) => `Published ${e.targetTitle ?? e.targetId}`,
  'publishing.unpublish': (e) => `Unpublished ${e.targetTitle ?? e.targetId}`,
  'publishing.schedule': (e) => `Scheduled publish for ${e.targetTitle ?? e.targetId}`,
  'publishing.rollback': (e) => `Rolled back ${e.targetTitle ?? e.targetId}`,
  'approval.requested': (e) => `Requested approval for ${e.targetTitle ?? e.targetId}`,
  'approval.granted': (e) => `Granted approval for ${e.targetTitle ?? e.targetId}`,
  'approval.declined': (e) => `Declined approval for ${e.targetTitle ?? e.targetId}`,
  'approval.expired': (e) => `Approval expired for ${e.targetTitle ?? e.targetId}`,
  'form.submission_received': (e) => `Form submission received for ${e.targetTitle ?? e.targetId}`,
  'integration.synced': (e) => `Synced ${e.integrationId}`,
  'integration.failed': (e) => `Integration failed: ${e.integrationId}`,
}

function generateSummary(event: AuditEventInput): string {
  const template = SUMMARY_TEMPLATES[event.action]
  if (template) return template(event)
  return `${event.action} (${event.mcpServer}:${event.mcpTool})`
}
```

### C4.4 — Build the audit plugin

`src/audit/plugin.ts`:

```typescript
import type { CorePlugin, BaseCorePluginOptions } from '@forumone/claude-cms-plugin-contract'
import { createAuditCollection, type AuditCollectionOptions } from './collection'
import { createAuditWriter } from './writer'
import { getPluginRegistry } from '@forumone/claude-cms-plugin-contract'
import type { Inngest } from 'inngest'

export interface AuditPluginOptions extends BaseCorePluginOptions, AuditCollectionOptions {
  /**
   * Inngest client for firing audit.event.recorded events. If not provided,
   * audit writes skip event emission; audit records still persist.
   */
  inngest?: Inngest
}

export const auditPlugin: CorePlugin<AuditPluginOptions> = (options) => (incomingConfig) => {
  if (options.enabled === false) return incomingConfig

  const auditCollection = createAuditCollection(options)

  return {
    ...incomingConfig,
    collections: [...(incomingConfig.collections ?? []), auditCollection],
    onInit: async (payload) => {
      if (incomingConfig.onInit) await incomingConfig.onInit(payload)

      const writer = createAuditWriter({
        payload,
        inngest: options.inngest,
        collectionSlug: options.slug,
        logger: options.logger ?? { warn: console.warn, error: console.error },
      })

      // Attach the writer to the Payload instance via the registry so other
      // plugins can use it without importing from this package directly.
      const registry = getPluginRegistry(payload)
      registry.register({
        id: '@forumone/claude-cms-core/audit',
        version: '0.1.0', // keep in sync with package.json
        capabilities: ['audit-log', 'audit-write'],
      })

      // Attach the writer function to the registry for peer plugins.
      attachAuditWriter(payload, writer)
    },
  }
}

const AUDIT_WRITER_SYMBOL = Symbol.for('@forumone/claude-cms/audit-writer')

function attachAuditWriter(payload: unknown, writer: ReturnType<typeof createAuditWriter>) {
  Object.defineProperty(payload as object, AUDIT_WRITER_SYMBOL, {
    value: writer,
    enumerable: false,
    writable: false,
  })
}

export function getAuditWriter(payload: unknown): ReturnType<typeof createAuditWriter> {
  const writer = (payload as Record<symbol, unknown>)[AUDIT_WRITER_SYMBOL]
  if (!writer) {
    throw new Error(
      'Audit writer not found. Ensure auditPlugin is registered in your Payload config before plugins that depend on it.',
    )
  }
  return writer as ReturnType<typeof createAuditWriter>
}
```

`src/audit/types.ts`:

```typescript
export type AuditAction =
  | 'content.find'
  | 'content.create'
  | 'content.update'
  | 'content.delete'
  | 'design.list'
  | 'design.suggest'
  | 'design.validate'
  | 'design.get_contract'
  | 'design.find_anti_pattern'
  | 'publishing.draft'
  | 'publishing.publish'
  | 'publishing.unpublish'
  | 'publishing.schedule'
  | 'publishing.rollback'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.declined'
  | 'approval.changes_requested'
  | 'approval.expired'
  | 'approval.discussed'
  | 'form.created'
  | 'form.submission_received'
  | 'integration.synced'
  | 'integration.failed'
  | 'system.error'
  | 'system.healthcheck'

export type AuditMcpServer =
  | 'payload'
  | 'component'
  | 'publishing'
  | 'approvals'
  | 'audit'
  | 'forms'
  | 'integrations'
```

`src/audit/index.ts`:

```typescript
export { auditPlugin, getAuditWriter } from './plugin'
export { createAuditCollection } from './collection'
export { createAuditWriter } from './writer'
export type { AuditPluginOptions } from './plugin'
export type { AuditEventInput } from './writer'
export type { AuditAction, AuditMcpServer } from './types'
```

### C4.5 — Build the MCP authentication

`src/auth/authenticator.ts`:

```typescript
import type { Payload } from 'payload'
import type { McpAuthResult, McpAuthenticator } from '@forumone/claude-cms-plugin-contract'

export interface BearerTokenAuthenticatorOptions {
  payload: Payload
  /**
   * Collection slug where API keys are stored. Defaults to 'mcp-api-keys'.
   * The collection must expose fields: `key` (hashed), `name`, `linkedUser` (relationship),
   * `scopes` (array of strings), `enabled` (boolean).
   */
  collectionSlug?: string
}

export function createBearerTokenAuthenticator(
  options: BearerTokenAuthenticatorOptions,
): McpAuthenticator {
  const { payload, collectionSlug = 'mcp-api-keys' } = options

  return {
    async authenticate(request: Request): Promise<McpAuthResult | null> {
      const header = request.headers.get('authorization')
      if (!header?.startsWith('Bearer ')) return null

      const token = header.slice('Bearer '.length).trim()
      if (!token) return null

      // Look up the key by hash. The storage column contains a SHA-256 hash;
      // the raw token is never stored.
      const hash = await hashToken(token)

      const result = await payload.find({
        collection: collectionSlug,
        where: {
          and: [
            { keyHash: { equals: hash } },
            { enabled: { equals: true } },
          ],
        },
        limit: 1,
        depth: 1, // resolve linkedUser
      })

      const apiKey = result.docs[0]
      if (!apiKey) return null

      const user = apiKey.linkedUser as Record<string, unknown> | undefined
      if (!user) return null

      return {
        user: {
          id: String(user.id),
          email: String(user.email),
          name: String(user.name ?? user.email),
          roles: (user.roles as string[] | undefined) ?? [],
          groups: (user.groups as string[] | undefined) ?? [],
        },
        apiKeyName: String(apiKey.name),
        apiKeyId: String(apiKey.id),
      }
    },
  }
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
```

`src/auth/api-keys.ts`:

```typescript
import type { CollectionConfig } from 'payload'

export interface ApiKeysCollectionOptions {
  slug?: string
  /** The slug of the users collection. Defaults to 'users'. */
  usersSlug?: string
  /** The list of scopes that can be assigned to keys. */
  availableScopes?: string[]
}

export function createApiKeysCollection(options: ApiKeysCollectionOptions = {}): CollectionConfig {
  const slug = options.slug ?? 'mcp-api-keys'
  const usersSlug = options.usersSlug ?? 'users'
  const availableScopes = options.availableScopes ?? [
    'content.read',
    'content.write',
    'design.read',
    'publishing.execute',
    'approvals.request',
    'approvals.decide',
    'forms.manage',
    'integrations.trigger',
    'audit.read',
  ]

  return {
    slug,
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', 'linkedUser', 'enabled', 'lastUsedAt'],
      description:
        'API keys for MCP clients. Each key is linked to a user; the key inherits that user\'s access control.',
    },
    access: {
      read: ({ req }) => (req.user?.roles as string[] | undefined)?.includes('admin') ?? false,
      create: ({ req }) => (req.user?.roles as string[] | undefined)?.includes('admin') ?? false,
      update: ({ req }) => (req.user?.roles as string[] | undefined)?.includes('admin') ?? false,
      delete: ({ req }) => (req.user?.roles as string[] | undefined)?.includes('admin') ?? false,
    },
    fields: [
      { name: 'name', type: 'text', required: true },
      {
        name: 'linkedUser',
        type: 'relationship',
        relationTo: usersSlug,
        required: true,
        admin: { description: 'The user whose access control this key inherits.' },
      },
      {
        name: 'scopes',
        type: 'select',
        hasMany: true,
        required: true,
        options: availableScopes.map((s) => ({ label: s, value: s })),
      },
      { name: 'enabled', type: 'checkbox', defaultValue: true, required: true },
      {
        name: 'keyHash',
        type: 'text',
        required: true,
        admin: { readOnly: true, description: 'SHA-256 hash of the key. The raw key is never stored.' },
      },
      {
        name: 'keyDisplay',
        type: 'text',
        admin: {
          readOnly: true,
          description: 'First and last 4 characters of the key for identification.',
        },
      },
      { name: 'expiresAt', type: 'date' },
      { name: 'lastUsedAt', type: 'date', admin: { readOnly: true } },
    ],
    hooks: {
      beforeChange: [
        async ({ data, operation }) => {
          if (operation === 'create' && !data.keyHash) {
            const rawKey = generateKey()
            data.keyHash = await hashKey(rawKey)
            data.keyDisplay = `${rawKey.slice(0, 4)}...${rawKey.slice(-4)}`
            // Attach the raw key to the operation for one-time display.
            // Payload's admin UI can surface this via a hook or custom field.
            ;(data as Record<string, unknown>).__rawKey = rawKey
          }
          return data
        },
      ],
    },
  }
}

function generateKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return (
    'ccms_' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  )
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
```

`src/auth/index.ts`:

```typescript
export { createBearerTokenAuthenticator } from './authenticator'
export { createApiKeysCollection } from './api-keys'
export type { BearerTokenAuthenticatorOptions } from './authenticator'
export type { ApiKeysCollectionOptions } from './api-keys'
```

### C4.6 — Build the event taxonomy and Inngest client factory

`src/events/taxonomy.ts`:

```typescript
/**
 * The canonical event taxonomy for the framework. Individual packages extend
 * this by declaring their own events. Clients register Inngest with the
 * combined taxonomy.
 */

export interface CoreEvents {
  'audit/event.recorded': {
    data: {
      auditEventId: string
      action: string
      actorId?: string
      targetCollection?: string
      targetId?: string
      approvalRequestId?: string
      integrationId?: string
    }
  }
  'content/page.published': {
    data: {
      collection: string
      id: string
      slug: string
      publishedBy: string
      previousPublishedAt: string | null
      isFirstPublish: boolean
    }
  }
  'content/page.unpublished': {
    data: { collection: string; id: string; slug: string; unpublishedBy: string }
  }
  'content/page.scheduled': {
    data: { collection: string; id: string; scheduledFor: string }
  }
  'content/page.rolled_back': {
    data: { collection: string; id: string; rolledBackBy: string; toVersionId: string }
  }
  'system/healthcheck': {
    data: { source: string; timestamp: string }
  }
}

/**
 * Declaration merging point for package-specific events. Individual server
 * packages extend this interface via module augmentation:
 *
 * ```ts
 * declare module '@forumone/claude-cms-core/events' {
 *   interface FrameworkEvents {
 *     'approval/decided': { data: { approvalId: string; decision: string } }
 *   }
 * }
 * ```
 */
export interface FrameworkEvents extends CoreEvents {}
```

`src/events/inngest.ts`:

```typescript
import { Inngest } from 'inngest'
import type { FrameworkEvents } from './taxonomy'

export interface InngestClientOptions {
  id: string
  eventKey?: string
  signingKey?: string
  env?: 'development' | 'preview' | 'production'
}

/**
 * Creates an Inngest client typed with the framework's event taxonomy.
 * Client apps call this once at module load and pass the result to plugins.
 */
export function createInngestClient(options: InngestClientOptions): Inngest<{ events: FrameworkEvents }> {
  return new Inngest({
    id: options.id,
    eventKey: options.eventKey ?? process.env.INNGEST_EVENT_KEY,
    signingKey: options.signingKey ?? process.env.INNGEST_SIGNING_KEY,
    env: options.env,
  }) as unknown as Inngest<{ events: FrameworkEvents }>
}
```

`src/events/index.ts`:

```typescript
export { createInngestClient } from './inngest'
export type { InngestClientOptions } from './inngest'
export type { FrameworkEvents, CoreEvents } from './taxonomy'
```

### C4.7 — Build the MCP handler infrastructure

`src/mcp/handler.ts`:

```typescript
import type { Payload } from 'payload'
import type { McpAuthenticator, McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import { z } from 'zod'
import { createBearerTokenAuthenticator } from '../auth/authenticator'

export interface McpHandlerOptions {
  payload: Payload
  serverName: string
  tools: McpToolDefinition[]
  authenticator?: McpAuthenticator
  logger?: { info: (m: string, c?: unknown) => void; error: (m: string, c?: unknown) => void }
}

/**
 * Creates an HTTP handler that implements the MCP JSON-RPC protocol over
 * streamable HTTP. Handles authentication, tool listing, tool invocation,
 * and error formatting.
 */
export function createMcpHandler(options: McpHandlerOptions) {
  const authenticator =
    options.authenticator ?? createBearerTokenAuthenticator({ payload: options.payload })
  const toolsByName = new Map(options.tools.map((t) => [t.name, t]))
  const logger = options.logger ?? { info: console.log, error: console.error }

  return async function handleMcp(request: Request): Promise<Response> {
    const authResult = await authenticator.authenticate(request)
    if (!authResult) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonRpcError(null, -32700, 'Parse error')
    }

    const parsed = JsonRpcRequestSchema.safeParse(body)
    if (!parsed.success) {
      return jsonRpcError(null, -32600, 'Invalid request')
    }

    const rpc = parsed.data

    try {
      if (rpc.method === 'tools/list') {
        const tools = options.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: zodToJsonSchema(tool.inputSchema),
        }))
        return jsonRpcResult(rpc.id, { tools })
      }

      if (rpc.method === 'tools/call') {
        const params = ToolCallParamsSchema.safeParse(rpc.params)
        if (!params.success) return jsonRpcError(rpc.id, -32602, 'Invalid params')

        const tool = toolsByName.get(params.data.name)
        if (!tool) return jsonRpcError(rpc.id, -32601, `Unknown tool: ${params.data.name}`)

        const inputParseResult = tool.inputSchema.safeParse(params.data.arguments)
        if (!inputParseResult.success) {
          return jsonRpcError(rpc.id, -32602, `Invalid arguments: ${inputParseResult.error.message}`)
        }

        const result = await tool.handler(inputParseResult.data, {
          user: authResult.user,
          apiKeyName: authResult.apiKeyName,
          logger: {
            debug: () => {},
            info: (m, c) => logger.info(`[${options.serverName}] ${m}`, c),
            warn: (m, c) => logger.info(`[${options.serverName}] WARN: ${m}`, c),
            error: (m, c) => logger.error(`[${options.serverName}] ${m}`, c),
          },
        })

        return jsonRpcResult(rpc.id, {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result),
            },
          ],
        })
      }

      return jsonRpcError(rpc.id, -32601, `Method not found: ${rpc.method}`)
    } catch (error) {
      logger.error('MCP handler error', { error, method: rpc.method })
      return jsonRpcError(rpc.id, -32603, 'Internal error')
    }
  }
}

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
})

const ToolCallParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function jsonRpcResult(id: unknown, result: unknown): Response {
  return jsonResponse({ jsonrpc: '2.0', id, result })
}

function jsonRpcError(id: unknown, code: number, message: string): Response {
  return jsonResponse({ jsonrpc: '2.0', id, error: { code, message } })
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Lightweight zod -> JSON schema conversion sufficient for MCP's tool schema.
  // Use the official zod-to-json-schema library if you want full fidelity;
  // this implementation handles the common cases for tool inputs.
  // ... implementation ...
  return {}
}
```

Note: zodToJsonSchema is a stub. Use the `zod-to-json-schema` npm package in the real implementation; specified via peerDependency or dependency in package.json.

`src/mcp/meta.ts`:

```typescript
import { z } from 'zod'

/**
 * The _meta parameter shape. Claude can populate this on consequential
 * tool calls to give the audit log context about user intent and reasoning.
 */
export const McpMetaSchema = z.object({
  userPrompt: z.string().optional(),
  reasoning: z.string().optional(),
  changesSummary: z.string().optional(),
}).optional()

export type McpMeta = z.infer<typeof McpMetaSchema>

/**
 * Helper for plugin authors to add the _meta field to their tool input schemas.
 *
 * ```ts
 * const inputSchema = withMeta(z.object({ pageId: z.string() }))
 * ```
 */
export function withMeta<T extends z.ZodRawShape>(shape: T) {
  return z.object({
    ...shape,
    _meta: McpMetaSchema,
  })
}
```

`src/mcp/index.ts`:

```typescript
export { createMcpHandler } from './handler'
export { McpMetaSchema, withMeta } from './meta'
export type { McpHandlerOptions } from './handler'
export type { McpMeta } from './meta'
```

### C4.8 — Build env handling

`src/env/index.ts`:

```typescript
import { z } from 'zod'

/**
 * Standard env var names used across core packages. Client apps declare
 * these in their env; plugins read from process.env using these names.
 */
export const ENV_VARS = {
  PAYLOAD_SECRET: 'PAYLOAD_SECRET',
  DATABASE_URI: 'DATABASE_URI',
  NEXT_PUBLIC_SERVER_URL: 'NEXT_PUBLIC_SERVER_URL',
  INNGEST_EVENT_KEY: 'INNGEST_EVENT_KEY',
  INNGEST_SIGNING_KEY: 'INNGEST_SIGNING_KEY',
  RESEND_API_KEY: 'RESEND_API_KEY',
  EMAIL_FROM_ADDRESS: 'EMAIL_FROM_ADDRESS',
  EMAIL_FROM_NAME: 'EMAIL_FROM_NAME',
  EMAIL_REPLY_TO: 'EMAIL_REPLY_TO',
  APPROVAL_TOKEN_SECRET: 'APPROVAL_TOKEN_SECRET',
  COMPONENT_SERVER_API_KEY: 'COMPONENT_SERVER_API_KEY',
  PUBLISHING_SERVER_API_KEY: 'PUBLISHING_SERVER_API_KEY',
  APPROVALS_SERVER_API_KEY: 'APPROVALS_SERVER_API_KEY',
  AUDIT_SERVER_API_KEY: 'AUDIT_SERVER_API_KEY',
  FORMS_SERVER_API_KEY: 'FORMS_SERVER_API_KEY',
  INTEGRATIONS_SERVER_API_KEY: 'INTEGRATIONS_SERVER_API_KEY',
} as const

const EnvSchema = z.object({
  [ENV_VARS.PAYLOAD_SECRET]: z.string().min(32, 'PAYLOAD_SECRET must be at least 32 characters'),
  [ENV_VARS.DATABASE_URI]: z.string().url(),
  [ENV_VARS.NEXT_PUBLIC_SERVER_URL]: z.string().url(),
})

/**
 * Validates the base env vars required by any framework deployment.
 * Plugins can extend with their own validation.
 */
export function validateBaseEnv(env: NodeJS.ProcessEnv = process.env) {
  const result = EnvSchema.safeParse(env)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path[0]}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment:\n${issues}`)
  }
  return result.data
}

/**
 * Retrieves an env var with validation. Throws if missing.
 */
export function requireEnv(name: string, message?: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(message ?? `Environment variable ${name} is required but not set`)
  }
  return value
}

/**
 * Retrieves an optional env var with a fallback.
 */
export function optionalEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback
}
```

### C4.9 — Build logger and utilities

`src/logger/index.ts`:

```typescript
import type { Logger } from '@forumone/claude-cms-plugin-contract'

/**
 * Default logger using console. Plugins accept a logger in options and
 * fall back to this.
 */
export const defaultLogger: Logger = {
  debug: (message, context) => console.debug(message, context ?? ''),
  info: (message, context) => console.log(message, context ?? ''),
  warn: (message, context) => console.warn(message, context ?? ''),
  error: (message, context) => console.error(message, context ?? ''),
}

/**
 * Creates a logger that prefixes messages with a component name.
 */
export function createNamedLogger(name: string, base: Logger = defaultLogger): Logger {
  return {
    debug: (message, context) => base.debug(`[${name}] ${message}`, context),
    info: (message, context) => base.info(`[${name}] ${message}`, context),
    warn: (message, context) => base.warn(`[${name}] ${message}`, context),
    error: (message, context) => base.error(`[${name}] ${message}`, context),
  }
}
```

`src/utils/diff.ts`:

```typescript
/**
 * Computes a shallow diff between two records. Returns a map of
 * field -> { before, after } for every changed field.
 */
export function shallowDiff<T extends Record<string, unknown>>(
  before: T,
  after: T,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    if (!isDeepEqual(before[key], after[key])) {
      diff[key] = { before: before[key], after: after[key] }
    }
  }
  return diff
}

function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}
```

`src/utils/id.ts`:

```typescript
/**
 * Generates a short, URL-safe unique ID.
 */
export function generateId(prefix?: string): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const id = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return prefix ? `${prefix}_${id}` : id
}
```

`src/utils/index.ts`:

```typescript
export { shallowDiff } from './diff'
export { generateId } from './id'
```

### C4.10 — Write the index exports

`src/index.ts`:

```typescript
// Audit
export {
  auditPlugin,
  getAuditWriter,
  createAuditCollection,
  createAuditWriter,
  type AuditPluginOptions,
  type AuditEventInput,
  type AuditAction,
  type AuditMcpServer,
} from './audit'

// Auth
export {
  createBearerTokenAuthenticator,
  createApiKeysCollection,
  type BearerTokenAuthenticatorOptions,
  type ApiKeysCollectionOptions,
} from './auth'

// Events
export {
  createInngestClient,
  type InngestClientOptions,
  type FrameworkEvents,
  type CoreEvents,
} from './events'

// MCP
export { createMcpHandler, McpMetaSchema, withMeta, type McpHandlerOptions, type McpMeta } from './mcp'

// Env
export { ENV_VARS, validateBaseEnv, requireEnv, optionalEnv } from './env'

// Logger
export { defaultLogger, createNamedLogger } from './logger'

// Utils
export { shallowDiff, generateId } from './utils'

// Re-export plugin contract types for convenience
export type {
  CorePlugin,
  BaseCorePluginOptions,
  McpToolDefinition,
  McpToolContext,
  McpAuthenticator,
  McpAuthResult,
  AuthenticatedUser,
  Logger,
  PluginRegistry,
  PluginRegistryEntry,
} from '@forumone/claude-cms-plugin-contract'
```

### C4.11 — Write tests

Comprehensive test coverage for every piece:

- `audit/writer.test.ts` — writer persists records, fire-and-forget semantics, summary generation, event emission
- `audit/collection.test.ts` — collection config is valid, access control works
- `auth/authenticator.test.ts` — valid tokens authenticate, invalid tokens reject, disabled keys reject, hash comparison is constant-time (verify via timing tests)
- `events/inngest.test.ts` — client creates with correct config
- `mcp/handler.test.ts` — tools list, tool call with valid input, tool call with invalid input, unauthenticated request, unknown tool, unknown method
- `mcp/meta.test.ts` — withMeta adds _meta field correctly
- `env/index.test.ts` — validation passes, fails on missing, fails on invalid
- `utils/diff.test.ts` — shallow diff works on primitives, objects, arrays
- `utils/id.test.ts` — IDs are unique, prefix is respected

Aim for 85%+ coverage.

### C4.12 — Write the playground wiring test

In `apps/playground/`, wire the audit plugin to verify it works end-to-end:

```typescript
// apps/playground/src/payload.config.ts
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { auditPlugin, createApiKeysCollection, createInngestClient } from '@forumone/claude-cms-core'

const inngest = createInngestClient({ id: 'claude-cms-playground' })

export default buildConfig({
  db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URI } }),
  collections: [
    // Users, etc.
    createApiKeysCollection(),
    // Example collection to create audit events for
    { slug: 'pages', fields: [{ name: 'title', type: 'text' }] },
  ],
  plugins: [auditPlugin({ inngest })],
  secret: process.env.PAYLOAD_SECRET!,
})
```

Run the playground, create a page through the Payload admin, verify an audit event is created.

### C4.13 — Add changeset and release

```bash
pnpm changeset
```

Select `@forumone/claude-cms-core`, choose `minor`, write:

> Initial release. Provides the audit log (collection, writer, plugin), MCP authentication (bearer token with API keys), event taxonomy and Inngest client factory, MCP handler infrastructure with _meta parameter support, standard env var handling, logger, and shared utilities. Every server package in the framework depends on this.

## Acceptance criteria

- [ ] `@forumone/claude-cms-core` builds and tests pass
- [ ] `auditPlugin` registers the collection, instantiates the writer, attaches it to Payload
- [ ] `getAuditWriter(payload)` returns the writer from any plugin that needs it
- [ ] Audit writer is fire-and-forget: failures log but never throw
- [ ] `createApiKeysCollection` creates a Payload collection with hashed keys
- [ ] `createBearerTokenAuthenticator` validates tokens against hashed storage
- [ ] `createInngestClient` returns a typed Inngest client
- [ ] `CoreEvents` and `FrameworkEvents` interfaces are declared; module augmentation pattern works
- [ ] `createMcpHandler` handles JSON-RPC over HTTP with authentication
- [ ] `withMeta` helper adds `_meta` field to Zod schemas
- [ ] Env var names are centralized in `ENV_VARS` constant
- [ ] All subpath exports work (`@forumone/claude-cms-core/audit`, `/events`, `/mcp`)
- [ ] Playground app wires auditPlugin and records events on Payload operations
- [ ] Test coverage is 85%+
- [ ] Package publishes cleanly to npm as 0.1.0

## Notes for Claude Code

- The audit writer's fire-and-forget semantics are non-negotiable. Every catch block must log but never rethrow. A failed audit write must never propagate to the caller. Test this explicitly.
- Module augmentation for `FrameworkEvents` is how packages add their events. Document the pattern clearly in the README; it's unusual enough that developers who haven't seen it will be confused.
- The `AUDIT_WRITER_SYMBOL` approach for attaching the writer to Payload is deliberately unusual. It avoids polluting Payload's types and guarantees isolation from other symbols. Don't replace this with a regular property.
- Key hashing uses Web Crypto API (`crypto.subtle.digest`) not Node's `crypto` module. This is because Payload runs on Vercel's edge runtime for some routes, and Web Crypto is the common denominator. The SHA-256 hash is fine for API keys because the keys themselves are cryptographically random.
- The MCP handler (C4.7) is the most complex piece. If the zodToJsonSchema stub is blocking progress, use the `zod-to-json-schema` npm package as a dependency and skip writing the conversion from scratch.
- Do not put anything design-system-specific or content-model-specific in this package. If you're tempted to add "Pages" or "Hero" or anything else client-specific, stop — that belongs in a client project, not core.
- The playground wiring test (C4.12) is the first real end-to-end validation of the architecture. If it doesn't work smoothly, fix it before moving on; downstream phases will hit the same issues.
- Commit after each major section (C4.2-C4.4 audit, C4.5 auth, C4.6 events, C4.7 MCP, C4.8-C4.9 utilities).

## What's next

Phase C5 builds the Component Server — `@forumone/claude-cms-components` — the first server package that consumes everything we've built so far. It's the MCP server that exposes a design system manifest as conversational primitives. After C5 ships, we have a working AI-native composition layer that Claude can use to reason about design systems.

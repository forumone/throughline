# Phase C9 — Integrations Server

## Goal

Build `@forumone/claude-cms-integrations` — the plugin architecture for connecting Payload to external systems. Ships the `Integration` interface contract, the registry pattern, the Integrations collection for per-instance configuration, MCP tools for observing and triggering integrations, and the first concrete integration (a generic outbound webhook with HMAC signing). Every future integration — Salesforce, Mailchimp, Slack, analytics warehouses — follows the pattern established here.

## Prerequisites

- C4 complete; audit and events infrastructure
- C6, C7 complete; server pattern is established and the event taxonomy includes publishing and approval events that integrations subscribe to

## Context

Every real client engagement needs integrations. Government clients need Salesforce. Nonprofits need Mailchimp. Foundations need bespoke data warehouse pipelines. Building these ad-hoc produces an unmaintainable tangle; building a plugin architecture keeps the surface area bounded as the integration count grows.

The Integrations Server is different from the other server packages. Instead of doing one specific thing well, it's a **framework within the framework**: a contract for integration modules plus tooling to register, configure, observe, and trigger them.

Key architectural choices:

- **Integrations are events-in, events-out.** Every integration subscribes to system events (`content/page.published`, `form/submission.received`, etc.) and emits its own results events. Integrations do not call each other directly — the event bus is the coupling boundary.
- **Configuration is admin-only.** Claude can trigger and observe integrations but cannot configure them. Allowing Claude to set destination URLs or API credentials would create prompt injection attack surface. The Integrations collection is edited in the Payload admin by authorized users only.
- **Failures are isolated.** A broken integration must not break publishing. Inngest retries handle transient failures; persistent failures mark the integration unhealthy and alert administrators, but the publishing pipeline continues.
- **The webhook integration is the example.** Every integration module follows its shape. Salesforce, Mailchimp, etc. are additional integrations with more complex OAuth flows and field mapping, but the package interface is stable.

## Tasks

### C9.1 — Scaffold the package

```
packages/integrations/
├── src/
│   ├── plugin.ts
│   ├── options.ts
│   ├── types.ts
│   ├── registry.ts
│   ├── collection.ts
│   ├── tools/
│   │   ├── list-integrations.ts
│   │   ├── get-integration-status.ts
│   │   ├── trigger-sync.ts
│   │   ├── test-integration.ts
│   │   ├── list-integration-types.ts
│   │   └── index.ts
│   ├── integrations/
│   │   ├── webhook/
│   │   │   ├── index.ts
│   │   │   ├── config-fields.ts
│   │   │   ├── functions.ts
│   │   │   └── healthcheck.ts
│   │   └── index.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── CHANGELOG.md
```

### C9.2 — Define the integration contract

`src/types.ts`:

```typescript
import type { Field } from 'payload'
import type { Inngest, InngestFunction } from 'inngest'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'

export interface Integration<Config = Record<string, unknown>> {
  /** Unique slug. e.g. 'webhook', 'salesforce', 'mailchimp'. */
  id: string
  /** Display name for the admin UI. */
  name: string
  /** One-line description shown when listing integration types. */
  description: string
  /** Category for organizational grouping. */
  category: 'crm' | 'marketing' | 'analytics' | 'webhook' | 'storage' | 'messaging' | 'other'
  /** Payload field definitions shown in the admin when configuring an instance. */
  configFields: Field[]
  /** Validates a config object against this integration's requirements. */
  validateConfig: (config: Config) => Promise<{ ok: boolean; reason?: string }>
  /** Which system events this integration subscribes to. */
  subscribes: Array<{ event: string; purpose: string }>
  /** Factory for Inngest functions this integration contributes. */
  createFunctions: (ctx: IntegrationContext) => InngestFunction[]
  /** Optional MCP tools this integration exposes through the Integrations Server. */
  mcpTools?: (ctx: IntegrationContext) => McpToolDefinition[]
  /** Health check function. Returns {ok: true} or {ok: false, details}. */
  healthcheck?: (config: Config) => Promise<{ ok: boolean; details?: string }>
}

export interface IntegrationContext {
  inngest: Inngest
  integrationsCollectionSlug: string
  /** Loads all enabled instances of this integration by its id. */
  loadInstances: <Config = Record<string, unknown>>(
    integrationId: string,
  ) => Promise<Array<{ id: string; name: string; config: Config }>>
  /** Updates an instance's lastSyncAt and lastSyncStatus fields. */
  updateStatus: (
    instanceId: string,
    status: 'success' | 'partial' | 'failed',
    error?: string,
  ) => Promise<void>
  /** Writes an audit event (thin wrapper over core's auditWriter). */
  recordAudit: (event: {
    integrationId: string
    instanceName: string
    action: 'integration.synced' | 'integration.failed'
    summary: string
    errorMessage?: string
  }) => Promise<void>
}

export interface IntegrationInstance {
  id: string
  name: string
  integrationType: string
  enabled: boolean
  config: Record<string, unknown>
  lastSyncAt?: string
  lastSyncStatus?: 'success' | 'partial' | 'failed' | 'never-run'
  lastError?: string
}
```

### C9.3 — Define options and registry

`src/options.ts`:

```typescript
import type { BaseCorePluginOptions } from '@forumone/claude-cms-plugin-contract'
import type { Inngest } from 'inngest'
import type { Integration } from './types'

export interface IntegrationsPluginOptions extends BaseCorePluginOptions {
  /** Inngest client for event subscriptions and function registration. Required. */
  inngest: Inngest
  /** The integration modules available in this deployment. */
  integrations?: Integration[]
  /** Override the Integrations collection slug. Default: 'integrations'. */
  collectionSlug?: string
}

export function validateOptions(options: IntegrationsPluginOptions): IntegrationsPluginOptions {
  if (!options.inngest) {
    throw new Error('integrationsPlugin requires an Inngest client')
  }
  return options
}
```

`src/registry.ts`:

```typescript
import type { Integration } from './types'

export class IntegrationRegistry {
  private readonly byId = new Map<string, Integration>()

  register(integration: Integration): void {
    if (this.byId.has(integration.id)) {
      throw new Error(`Integration "${integration.id}" is already registered`)
    }
    this.byId.set(integration.id, integration)
  }

  get(id: string): Integration | undefined {
    return this.byId.get(id)
  }

  list(): Integration[] {
    return Array.from(this.byId.values())
  }

  has(id: string): boolean {
    return this.byId.has(id)
  }
}
```

### C9.4 — Build the Integrations collection

`src/collection.ts`:

```typescript
import type { CollectionConfig } from 'payload'
import type { IntegrationRegistry } from './registry'

export interface CreateCollectionOptions {
  slug?: string
  registry: IntegrationRegistry
}

export function createIntegrationsCollection(options: CreateCollectionOptions): CollectionConfig {
  const slug = options.slug ?? 'integrations'

  return {
    slug,
    admin: {
      useAsTitle: 'name',
      defaultColumns: ['name', 'integrationType', 'enabled', 'lastSyncAt', 'lastSyncStatus'],
    },
    access: {
      read: ({ req }) => {
        const roles = (req.user?.roles as string[] | undefined) ?? []
        return roles.includes('admin') || roles.includes('editor')
      },
      create: ({ req }) => (req.user?.roles as string[] | undefined)?.includes('admin') ?? false,
      update: ({ req }) => (req.user?.roles as string[] | undefined)?.includes('admin') ?? false,
      delete: ({ req }) => (req.user?.roles as string[] | undefined)?.includes('admin') ?? false,
    },
    fields: [
      { name: 'name', type: 'text', required: true },
      {
        name: 'integrationType',
        type: 'select',
        required: true,
        options: options.registry.list().map((i) => ({ label: i.name, value: i.id })),
        admin: { description: 'The integration plugin this instance uses.' },
      },
      { name: 'enabled', type: 'checkbox', defaultValue: false },
      {
        name: 'config',
        type: 'json',
        admin: { description: 'Integration-specific configuration.' },
      },
      { name: 'lastSyncAt', type: 'date', admin: { readOnly: true } },
      {
        name: 'lastSyncStatus',
        type: 'select',
        admin: { readOnly: true },
        options: [
          { label: 'Never run', value: 'never-run' },
          { label: 'Success', value: 'success' },
          { label: 'Partial', value: 'partial' },
          { label: 'Failed', value: 'failed' },
        ],
      },
      { name: 'lastError', type: 'textarea', admin: { readOnly: true } },
    ],
    hooks: {
      beforeChange: [
        async ({ data, operation, req }) => {
          if (operation === 'create' || operation === 'update') {
            const integration = options.registry.get(data.integrationType as string)
            if (!integration) {
              throw new Error(`Unknown integration type: ${data.integrationType}`)
            }
            const validation = await integration.validateConfig(data.config ?? {})
            if (!validation.ok) {
              throw new Error(`Invalid config: ${validation.reason}`)
            }
          }
          return data
        },
      ],
    },
  }
}
```

### C9.5 — Build the MCP tools

`src/tools/list-integrations.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import type { Payload } from 'payload'

export function createListIntegrationsTool(deps: { payload: Payload; collectionSlug: string }): McpToolDefinition {
  return {
    name: 'list_integrations',
    description:
      'Lists all configured integration instances with their current status. Use to answer "what connections are set up?" or "is the CRM sync working?".',
    inputSchema: z.object({
      integrationType: z.string().optional(),
      onlyEnabled: z.boolean().optional(),
    }),
    handler: async (input, ctx) => {
      const conditions: Record<string, unknown>[] = []
      if (input.integrationType) conditions.push({ integrationType: { equals: input.integrationType } })
      if (input.onlyEnabled) conditions.push({ enabled: { equals: true } })

      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        where: conditions.length > 0 ? { and: conditions } : undefined,
        sort: 'name',
        limit: 100,
      })

      return {
        integrations: result.docs.map((doc) => ({
          id: String(doc.id),
          name: String(doc.name),
          type: String(doc.integrationType),
          enabled: Boolean(doc.enabled),
          lastSync: doc.lastSyncAt
            ? { at: String(doc.lastSyncAt), status: String(doc.lastSyncStatus ?? 'unknown') }
            : null,
          lastError: doc.lastError ? String(doc.lastError) : undefined,
        })),
      }
    },
  }
}
```

`src/tools/get-integration-status.ts`, `src/tools/trigger-sync.ts`, `src/tools/test-integration.ts`, `src/tools/list-integration-types.ts` — follow the pattern.

`trigger-sync` fires an `integration/manual-sync` Inngest event that integrations can subscribe to. `test-integration` calls the integration's healthcheck function and returns the result.

`src/tools/index.ts`:

```typescript
export { createListIntegrationsTool } from './list-integrations'
export { createGetIntegrationStatusTool } from './get-integration-status'
export { createTriggerSyncTool } from './trigger-sync'
export { createTestIntegrationTool } from './test-integration'
export { createListIntegrationTypesTool } from './list-integration-types'
```

### C9.6 — Build the webhook integration

`src/integrations/webhook/config-fields.ts`:

```typescript
import type { Field } from 'payload'

export const configFields: Field[] = [
  {
    name: 'targetUrl',
    type: 'text',
    required: true,
    admin: { description: 'HTTPS URL to POST events to.' },
  },
  {
    name: 'signingSecret',
    type: 'text',
    required: true,
    admin: {
      description:
        'Secret used to compute HMAC-SHA256 signatures. The receiving system verifies this to confirm the request came from your system.',
    },
  },
  {
    name: 'eventFilter',
    type: 'select',
    hasMany: true,
    options: [
      { label: 'Page published', value: 'content/page.published' },
      { label: 'Page unpublished', value: 'content/page.unpublished' },
      { label: 'Page rolled back', value: 'content/page.rolled_back' },
      { label: 'Form submission received', value: 'form/submission.received' },
      { label: 'Approval decided', value: 'approval/decided' },
    ],
    admin: { description: 'Only deliver these event types. Leave empty to deliver all subscribed events.' },
  },
  {
    name: 'includeFullPayload',
    type: 'checkbox',
    defaultValue: false,
    admin: { description: 'If true, include full document body in the webhook. If false, only send metadata and IDs.' },
  },
  {
    name: 'timeoutSeconds',
    type: 'number',
    defaultValue: 10,
    admin: { description: 'Request timeout. Default 10 seconds.' },
  },
]
```

`src/integrations/webhook/functions.ts`:

```typescript
import type { InngestFunction } from 'inngest'
import type { IntegrationContext } from '../../types'

interface WebhookConfig {
  targetUrl: string
  signingSecret: string
  eventFilter?: string[]
  includeFullPayload?: boolean
  timeoutSeconds?: number
}

export function createWebhookFunctions(ctx: IntegrationContext): InngestFunction[] {
  const deliver = ctx.inngest.createFunction(
    { id: 'webhook-deliver', retries: 5 },
    [
      { event: 'content/page.published' },
      { event: 'content/page.unpublished' },
      { event: 'content/page.rolled_back' },
      { event: 'form/submission.received' },
      { event: 'approval/decided' },
    ],
    async ({ event, step, logger }) => {
      const instances = await step.run('load-webhook-instances', () =>
        ctx.loadInstances<WebhookConfig>('webhook'),
      )

      for (const instance of instances) {
        if (instance.config.eventFilter?.length && !instance.config.eventFilter.includes(event.name)) {
          continue
        }

        await step.run(`deliver-${instance.id}`, async () => {
          const body = JSON.stringify({
            event: event.name,
            data: instance.config.includeFullPayload ? event.data : extractIds(event.data),
            timestamp: Date.now(),
          })

          const signature = await hmacSign(body, instance.config.signingSecret)
          const timeoutMs = (instance.config.timeoutSeconds ?? 10) * 1000

          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), timeoutMs)

          let response: Response
          try {
            response = await fetch(instance.config.targetUrl, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-claude-cms-event': event.name,
                'x-claude-cms-signature': `sha256=${signature}`,
                'x-claude-cms-timestamp': String(Date.now()),
              },
              body,
              signal: controller.signal,
            })
          } finally {
            clearTimeout(timer)
          }

          const success = response.ok
          await ctx.updateStatus(instance.id, success ? 'success' : 'failed', success ? undefined : `HTTP ${response.status}`)
          await ctx.recordAudit({
            integrationId: instance.id,
            instanceName: instance.name,
            action: success ? 'integration.synced' : 'integration.failed',
            summary: success
              ? `Delivered ${event.name} to ${instance.name}`
              : `Failed to deliver ${event.name} to ${instance.name}: HTTP ${response.status}`,
            errorMessage: success ? undefined : `HTTP ${response.status}`,
          })

          if (!success) {
            throw new Error(`Webhook delivery failed: HTTP ${response.status}`)
          }
        })
      }
    },
  )

  // Also handle manual sync triggers
  const manualTrigger = ctx.inngest.createFunction(
    { id: 'webhook-manual-trigger' },
    { event: 'integration/manual-sync' },
    async ({ event, step }) => {
      const { integrationId } = event.data as { integrationId: string; payload?: unknown }
      const instances = await step.run('load-target', async () => {
        const all = await ctx.loadInstances<WebhookConfig>('webhook')
        return all.filter((i) => i.id === integrationId)
      })

      for (const instance of instances) {
        await step.run(`deliver-test-${instance.id}`, async () => {
          const body = JSON.stringify({
            event: 'integration/manual-sync',
            data: { message: 'Test delivery triggered manually', instanceId: instance.id },
            timestamp: Date.now(),
          })
          const signature = await hmacSign(body, instance.config.signingSecret)

          await fetch(instance.config.targetUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-claude-cms-event': 'integration/manual-sync',
              'x-claude-cms-signature': `sha256=${signature}`,
            },
            body,
          })
        })
      }
    },
  )

  return [deliver, manualTrigger]
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function extractIds(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || key === 'slug' || key.endsWith('Id')) {
      result[key] = value
    }
  }
  return result
}
```

`src/integrations/webhook/healthcheck.ts`:

```typescript
export async function healthcheck(config: { targetUrl: string }) {
  try {
    const response = await fetch(config.targetUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok || response.status === 405) {
      return { ok: true, details: `Reachable (HTTP ${response.status})` }
    }
    return { ok: false, details: `Endpoint returned HTTP ${response.status}` }
  } catch (error) {
    return { ok: false, details: error instanceof Error ? error.message : 'Unknown error' }
  }
}
```

`src/integrations/webhook/index.ts`:

```typescript
import type { Integration } from '../../types'
import { configFields } from './config-fields'
import { createWebhookFunctions } from './functions'
import { healthcheck } from './healthcheck'

interface WebhookConfig {
  targetUrl: string
  signingSecret: string
  eventFilter?: string[]
  includeFullPayload?: boolean
  timeoutSeconds?: number
}

export const webhookIntegration: Integration<WebhookConfig> = {
  id: 'webhook',
  name: 'Generic Webhook',
  description: 'POST system events to an external URL with HMAC-signed payloads.',
  category: 'webhook',
  configFields,
  async validateConfig(config) {
    if (!config?.targetUrl) return { ok: false, reason: 'targetUrl is required' }
    try {
      const url = new URL(config.targetUrl)
      if (url.protocol !== 'https:') return { ok: false, reason: 'targetUrl must use HTTPS' }
    } catch {
      return { ok: false, reason: 'targetUrl is not a valid URL' }
    }
    if (!config.signingSecret || config.signingSecret.length < 32) {
      return { ok: false, reason: 'signingSecret must be at least 32 characters' }
    }
    return { ok: true }
  },
  subscribes: [
    { event: 'content/page.published', purpose: 'Notify external systems when content goes live' },
    { event: 'content/page.unpublished', purpose: 'Notify when content is taken down' },
    { event: 'form/submission.received', purpose: 'Forward form data' },
  ],
  createFunctions: createWebhookFunctions,
  healthcheck,
}
```

`src/integrations/index.ts`:

```typescript
export { webhookIntegration } from './webhook'
```

### C9.7 — Build the plugin

`src/plugin.ts`:

```typescript
import type { CorePlugin } from '@forumone/claude-cms-plugin-contract'
import { getPluginRegistry } from '@forumone/claude-cms-plugin-contract'
import { createMcpHandler, createNamedLogger, getAuditWriter } from '@forumone/claude-cms-core'
import { validateOptions, type IntegrationsPluginOptions } from './options'
import { IntegrationRegistry } from './registry'
import { createIntegrationsCollection } from './collection'
import { webhookIntegration } from './integrations'
import type { IntegrationContext } from './types'
import {
  createListIntegrationsTool,
  createGetIntegrationStatusTool,
  createTriggerSyncTool,
  createTestIntegrationTool,
  createListIntegrationTypesTool,
} from './tools'

export const integrationsPlugin: CorePlugin<IntegrationsPluginOptions> = (rawOptions) => (incomingConfig) => {
  if (rawOptions.enabled === false) return incomingConfig

  const options = validateOptions(rawOptions)
  const collectionSlug = options.collectionSlug ?? 'integrations'
  const routePrefix = options.routePrefix ?? '/api/integrations'
  const logger = createNamedLogger('integrations', options.logger)

  const registry = new IntegrationRegistry()
  registry.register(webhookIntegration)
  for (const integration of options.integrations ?? []) {
    registry.register(integration)
  }

  const collection = createIntegrationsCollection({ slug: collectionSlug, registry })

  return {
    ...incomingConfig,
    collections: [...(incomingConfig.collections ?? []), collection],
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      {
        path: `${routePrefix}/mcp`,
        method: 'post',
        handler: async (req) => {
          const handler = (req.payload as unknown as Record<symbol, unknown>)[MCP_HANDLER_SYMBOL] as
            | ((r: Request) => Promise<Response>) | undefined
          if (!handler) {
            return new Response(JSON.stringify({ error: 'Integrations MCP not initialized' }), {
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

      const pluginRegistry = getPluginRegistry(payload)
      pluginRegistry.requireCapability('audit-log', '@forumone/claude-cms-integrations')

      const auditWriter = getAuditWriter(payload)

      const integrationContext: IntegrationContext = {
        inngest: options.inngest,
        integrationsCollectionSlug: collectionSlug,
        async loadInstances<Config = Record<string, unknown>>(integrationId: string) {
          const result = await payload.find({
            collection: collectionSlug,
            where: {
              and: [
                { integrationType: { equals: integrationId } },
                { enabled: { equals: true } },
              ],
            },
            limit: 100,
          })
          return result.docs.map((doc) => ({
            id: String(doc.id),
            name: String(doc.name),
            config: (doc.config ?? {}) as Config,
          }))
        },
        async updateStatus(instanceId, status, error) {
          await payload.update({
            collection: collectionSlug,
            id: instanceId,
            data: {
              lastSyncAt: new Date().toISOString(),
              lastSyncStatus: status,
              lastError: error,
            },
          })
        },
        async recordAudit(event) {
          await auditWriter({
            actor: { type: 'system', apiKeyName: `integration:${event.integrationId}` },
            action: event.action,
            mcpServer: 'integrations',
            mcpTool: `integration:${event.integrationId}`,
            integrationId: event.integrationId,
            summary: event.summary,
            errorMessage: event.errorMessage,
            success: event.action === 'integration.synced',
          })
        },
      }

      // Register each integration's Inngest functions
      for (const integration of registry.list()) {
        const functions = integration.createFunctions(integrationContext)
        logger.info(`Registered integration "${integration.id}" with ${functions.length} Inngest function(s)`)
        // NOTE: Inngest functions are registered via the serve handler in the
        // Next.js inngest endpoint, not here. The client app's inngest endpoint
        // merges core functions with integration functions. See docs/wiring.md.
      }

      const deps = { payload, collectionSlug }
      const tools = [
        createListIntegrationsTool(deps),
        createGetIntegrationStatusTool(deps),
        createTriggerSyncTool({ ...deps, inngest: options.inngest }),
        createTestIntegrationTool({ ...deps, registry }),
        createListIntegrationTypesTool({ registry }),
      ]

      const handler = createMcpHandler({
        payload,
        serverName: 'integrations',
        tools,
        logger: { info: logger.info, error: logger.error },
      })

      Object.defineProperty(payload as object, MCP_HANDLER_SYMBOL, {
        value: handler,
        enumerable: false,
        writable: false,
      })

      // Expose registry and context via symbols for the client app's Inngest endpoint to pick up
      Object.defineProperty(payload as object, REGISTRY_SYMBOL, {
        value: registry,
        enumerable: false,
        writable: false,
      })
      Object.defineProperty(payload as object, CONTEXT_SYMBOL, {
        value: integrationContext,
        enumerable: false,
        writable: false,
      })

      pluginRegistry.register({
        id: '@forumone/claude-cms-integrations',
        version: '0.1.0',
        capabilities: ['integrations', 'integration-registry'],
      })
    },
  }
}

const MCP_HANDLER_SYMBOL = Symbol.for('@forumone/claude-cms/integrations-mcp-handler')
const REGISTRY_SYMBOL = Symbol.for('@forumone/claude-cms/integrations-registry')
const CONTEXT_SYMBOL = Symbol.for('@forumone/claude-cms/integrations-context')

export function getIntegrationRegistry(payload: unknown): IntegrationRegistry | undefined {
  return (payload as Record<symbol, unknown>)[REGISTRY_SYMBOL] as IntegrationRegistry | undefined
}

export function getIntegrationContext(payload: unknown): IntegrationContext | undefined {
  return (payload as Record<symbol, unknown>)[CONTEXT_SYMBOL] as IntegrationContext | undefined
}
```

### C9.8 — Document the Inngest wiring

Create `docs/integrations-wiring.md` in the core monorepo root:

```markdown
# Integrations and Inngest wiring

Integration modules contribute Inngest functions that need to be served by the
client app's Inngest endpoint. The integrations plugin itself does not serve
Inngest; it only registers functions with the registry. Client apps merge
integration functions with core functions in their Inngest handler.

## Pattern

In your client app's `src/app/api/inngest/route.ts`:

```typescript
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import { coreFunctions } from '@/lib/inngest-functions'
import { getIntegrationRegistry, getIntegrationContext } from '@forumone/claude-cms-integrations'
import payload from '@/lib/payload'

const registry = getIntegrationRegistry(payload)
const context = getIntegrationContext(payload)

const integrationFunctions = registry
  ? registry.list().flatMap((i) => i.createFunctions(context!))
  : []

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...coreFunctions, ...integrationFunctions],
})
```

This pattern is clunky — a future Phase 2 enhancement should publish a
`wireInngest()` helper that handles this automatically. For now, document
it and move on.
```

### C9.9 — Index, tests, README, changeset

`src/index.ts`:

```typescript
export { integrationsPlugin, getIntegrationRegistry, getIntegrationContext } from './plugin'
export { webhookIntegration } from './integrations'
export type { Integration, IntegrationContext, IntegrationInstance } from './types'
export type { IntegrationsPluginOptions } from './options'
```

Tests for: registry registration and lookup, collection access control, each MCP tool, webhook config validation, HMAC signing correctness (known-answer test), healthcheck.

Changeset:

> Initial release. Plugin architecture for connecting to external systems. Ships the Integration contract, registry, collection, and five MCP tools (list, status, trigger, test, list types). Includes webhook integration as the reference implementation with HMAC-SHA256 signing, configurable event filtering, retries, and healthcheck.

## Acceptance criteria

- [ ] `Integration` interface defined; registry registers and retrieves integrations
- [ ] Integrations collection created with per-type config validation
- [ ] Five MCP tools work against configured integrations
- [ ] Configuration is admin-only (Claude cannot create or modify integrations)
- [ ] Webhook integration implements the full contract with HMAC signing, retries, healthcheck
- [ ] Documentation exists for how clients wire integration Inngest functions
- [ ] Plugin fails at init if audit capability is missing
- [ ] Failures are isolated (test: broken webhook does not break publishing)
- [ ] Test coverage 80%+

## Notes for Claude Code

- The integration contract is where an agency's future productivity compounds. Write the interface carefully; every future integration (Salesforce, Mailchimp, etc.) will use the same shape. If the interface is awkward, every integration is awkward.
- The Inngest wiring in C9.8 is genuinely clunky. Acknowledge it in the docs and move on — making it clean requires either deeper Payload integration or a wrapper pattern that's out of scope for Phase 1.
- Configuration being admin-only is a security property, not a UX choice. Prompt injection could make Claude send form submissions to attacker-controlled URLs if Claude could set destination URLs. The fact that Claude can trigger and observe but not configure is a deliberate asymmetry.
- The webhook integration deliberately supports simple use cases only. Complex integrations (Salesforce, Mailchimp) will have OAuth flows, field mapping UIs, sync state, and many other concerns. They are full per-client projects, not drop-in integrations. The webhook proves the pattern works.
- When testing HMAC signing, use known-answer tests with hardcoded inputs and expected outputs. This is non-negotiable for any signing code — the test is more important than the implementation.
- Commit after types (C9.2), registry (C9.3), collection (C9.4), tools (C9.5), webhook integration (C9.6), plugin (C9.7).

## What's next

Phase C10 builds the Workflows package — composable Inngest functions for revalidation, scheduled publishes, approval expiration, and healthchecks. The pattern is: core ships function factories; client apps compose them into their Inngest handler. After C10, the event-driven side of the framework is complete and all five server packages plus audit writes flow through properly.

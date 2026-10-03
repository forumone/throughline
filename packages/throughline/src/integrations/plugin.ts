import type { CorePlugin } from '../plugin-contract/index.js'
import type { McpToolDefinition } from '../plugin-contract/mcp.js'
import { getPluginRegistry } from '../plugin-contract/registry.js'
import { createNamedLogger, defaultLogger } from '../logger/index.js'
import { getAuditWriter } from '../audit/plugin.js'
import { type IntegrationsPluginOptions, validateOptions, DEFAULT_INTEGRATIONS_SLUG } from './options.js'
import { IntegrationRegistry } from './registry.js'
import { createIntegrationsCollection } from './collection.js'
import { createSyncEndpoint } from './endpoints/sync.js'
import { createStatusWriter } from './sync/status.js'
import { webhookIntegration } from './integrations/index.js'
import type { Integration, IntegrationContext } from './types.js'
import { createTerminalFailureHandler } from '../jobs/failure-handler.js'
import { type Job, type JobContext } from '../jobs/types.js'
import {
  INTEGRATIONS_TOOL_DESCRIPTORS,
  createGetIntegrationStatusTool,
  createListIntegrationsTool,
  createListIntegrationTypesTool,
  createTestIntegrationTool,
  createTriggerSyncTool,
} from './tools/index.js'

const PLUGIN_ID = '@forumone/throughline/integrations'
const PLUGIN_VERSION = '0.1.0'

/*
A site that runs integrations as jobs has no Inngest client, but the context's
type still promises one, so existing integrations keep compiling. Any use of it
says what to do instead.
*/
const noInngest = new Proxy({} as IntegrationContext['inngest'], {
  get: () => {
    throw new Error(
      'This site runs integrations as jobs and has no Inngest client. Send events with ctx.emit, and give the integration createJobs.',
    )
  },
})

const REGISTRY_SYMBOL = Symbol.for('@forumone/throughline/integrations-registry')
const CONTEXT_SYMBOL = Symbol.for('@forumone/throughline/integrations-context')

/**
 * Integrations server. Registers the Integrations collection — with its
 * manual-sync endpoint and the Sync now button in its sidebar — the five-tool
 * MCP server, and a process-local registry of integration modules. The webhook integration is registered automatically; clients
 * extend the registry by passing additional integrations via options.
 *
 * Integration Inngest functions are not served here — they are exposed
 * via `getIntegrationRegistry(payload)` so the client app's Inngest
 * endpoint can merge them with its own functions. See
 * `docs/integrations-wiring.md` in the repository root.
 *
 * The collection carries one admin component, the sidebar's Sync now button,
 * so hosts must run `payload generate:importmap` after adding this plugin (the
 * dev server does it automatically). A stale import map 500s the admin screen.
 */
export const integrationsPlugin: CorePlugin<IntegrationsPluginOptions> =
  (rawOptions) => (incomingConfig) => {
    if (rawOptions.enabled === false) return incomingConfig

    const options = validateOptions(rawOptions)
    const collectionSlug = options.collectionSlug ?? DEFAULT_INTEGRATIONS_SLUG
    const inngest = options.inngest
    // `emit` when the site gave one, otherwise Inngest; validateOptions saw to one of them.
    const emit =
      options.emit ??
      (async (event: { name: string; data: unknown }) => {
        await inngest!.send(event)
      })
    // What the manual-sync endpoint and tool send through.
    const transport = { ...(inngest ? { inngest } : {}), emit }
    const logger = createNamedLogger('integrations', options.logger ?? defaultLogger)

    const registry = new IntegrationRegistry()
    registry.register(webhookIntegration as unknown as Parameters<typeof registry.register>[0])
    for (const integration of options.integrations ?? []) {
      registry.register(integration)
    }

    const collection = createIntegrationsCollection({
      slug: collectionSlug,
      registry,
      // The admin's path to `integration/manual-sync`, sharing
      // `requestManualSync` with the `trigger_sync` MCP tool so the two cannot
      // disagree about what a trigger checks or what event it sends.
      endpoints: [createSyncEndpoint({ collectionSlug, ...transport })],
      ...(options.admin ? { admin: options.admin } : {}),
    })

    /*
    Declared here, bound at `onInit` — `mcpPlugin` generates its per-key
    checkboxes from these names and descriptions while the config is built, and
    denies any tool it has no checkbox for. This plugin must therefore come
    before `mcpPlugin` in the host's array.
    */
    options.mcpTools?.declare(INTEGRATIONS_TOOL_DESCRIPTORS, { serverName: 'integrations' })

    return {
      ...incomingConfig,
      collections: [...(incomingConfig.collections ?? []), collection],
      onInit: async (payload) => {
        if (incomingConfig.onInit) await incomingConfig.onInit(payload)

        const pluginRegistry = getPluginRegistry(payload)
        pluginRegistry.requireCapability('audit-log', PLUGIN_ID)

        const auditWriter = getAuditWriter(payload)

        const context: IntegrationContext = {
          inngest: options.inngest ?? noInngest,
          emit,
          onFailure: options.onTerminalFailure ?? createTerminalFailureHandler({ payload }),
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
            return (result.docs as Array<Record<string, unknown>>).map((doc) => ({
              id: String(doc['id']),
              name: String(doc['name']),
              config: (doc['config'] ?? {}) as Config,
            }))
          },
          updateStatus: createStatusWriter(payload, collectionSlug),
          async recordAudit(event) {
            await auditWriter({
              actor: { type: 'system', apiKeyName: `integration:${event.integrationId}` },
              action: event.action,
              mcpServer: 'integrations',
              mcpTool: `integration:${event.integrationId}`,
              integrationId: event.instanceName,
              summary: event.summary,
              ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
              success: event.action === 'integration.synced',
            })
          },
        }

        for (const integration of registry.list()) {
          if (options.inngest && integration.createFunctions) {
            const fnCount = integration.createFunctions(context).length
            logger.info('Integration registered', { id: integration.id, inngestFunctions: fnCount })
          } else if (integration.createJobs) {
            logger.info('Integration registered', { id: integration.id, runner: 'jobs' })
          } else {
            logger.warn(
              'Integration has no jobs, and this site has no Inngest client, so it will not run',
              { id: integration.id },
            )
          }
        }

        const deps = { payload, collectionSlug }
        const tools = [
          createListIntegrationsTool(deps),
          createGetIntegrationStatusTool(deps),
          createTriggerSyncTool({ ...deps, ...transport }),
          createTestIntegrationTool({ ...deps, registry }),
          createListIntegrationTypesTool({ registry }),
        ] as unknown as McpToolDefinition[]

        // Payload's own MCP plugin, and the only transport these tools have.
        // `onInit` is both the earliest they can exist and still early enough
        // that `mcpPlugin` reads the array populated.
        options.mcpTools?.add(tools, { serverName: 'integrations', logger, audit: auditWriter })

        Object.defineProperty(payload, REGISTRY_SYMBOL, {
          value: registry,
          enumerable: false,
          writable: false,
          configurable: false,
        })
        Object.defineProperty(payload, CONTEXT_SYMBOL, {
          value: context,
          enumerable: false,
          writable: false,
          configurable: false,
        })

        pluginRegistry.register({
          id: PLUGIN_ID,
          version: PLUGIN_VERSION,
          capabilities: ['integrations', 'integration-registry'],
        })

        logger.info('Integrations server ready', {
          collectionSlug,
          integrationCount: registry.size,
        })
      },
    }
  }

/**
 * The registry this plugin attached at init, if it did.
 *
 * `Fn` is the host's own Inngest function type. Naming it is what lets the host
 * serve `createFunctions()` results without asserting them back — the registry
 * stores integrations at `unknown` otherwise, and an `unknown[]` cannot be
 * handed to `serve()`:
 *
 * ```ts
 * const registry = getIntegrationRegistry<InngestFunction.Any>(payload)
 * ```
 *
 * There is no checking behind it either way — the value comes off a symbol on
 * the Payload instance. What the parameter buys is that the assertion happens
 * once, here, in terms of the host's own types, rather than at every read.
 */
export function getIntegrationRegistry<Fn = unknown>(
  payload: unknown,
): IntegrationRegistry<Fn> | undefined {
  return (payload as Record<symbol, unknown>)[REGISTRY_SYMBOL] as
    | IntegrationRegistry<Fn>
    | undefined
}

/**
 * Every registered integration's jobs, for a site whose jobs adapter takes its
 * jobs while the config is being built (`payloadJobs().plugin(...)`).
 *
 * Pass the same `integrations` as `integrationsPlugin`; the built-in webhook is
 * included, as the plugin includes it. An integration without `createJobs`
 * contributes nothing here and runs on Inngest only. Each job reads the
 * integrations context from Payload when it runs, so `integrationsPlugin` must
 * be registered too.
 */
export function integrationsJobs(
  options: Pick<IntegrationsPluginOptions, 'integrations'> = {},
): Job[] {
  const getContext = (job: JobContext): IntegrationContext => {
    if (!job.payload) {
      throw new Error(
        'integrationsJobs: this runner gave the job no Payload instance. Use payloadJobs, or pass `payload` to inngestJobs.',
      )
    }
    const context = getIntegrationContext(job.payload)
    if (!context) {
      throw new Error(
        'integrationsJobs: no integrations context on Payload. Register integrationsPlugin as well.',
      )
    }
    return context
  }
  const integrations = [webhookIntegration as unknown as Integration, ...(options.integrations ?? [])]
  return integrations.flatMap((integration) => integration.createJobs?.(getContext) ?? [])
}

export function getIntegrationContext(payload: unknown): IntegrationContext | undefined {
  return (payload as Record<symbol, unknown>)[CONTEXT_SYMBOL] as IntegrationContext | undefined
}

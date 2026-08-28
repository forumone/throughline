import type { CorePlugin, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import { createNamedLogger, defaultLogger, getAuditWriter } from '@forumone/throughline-core'
import { type IntegrationsPluginOptions, validateOptions, DEFAULT_INTEGRATIONS_SLUG } from './options.js'
import { IntegrationRegistry } from './registry.js'
import { createIntegrationsCollection } from './collection.js'
import { webhookIntegration } from './integrations/index.js'
import type { IntegrationContext } from './types.js'
import {
  INTEGRATIONS_TOOL_DESCRIPTORS,
  createGetIntegrationStatusTool,
  createListIntegrationsTool,
  createListIntegrationTypesTool,
  createTestIntegrationTool,
  createTriggerSyncTool,
} from './tools/index.js'

const PLUGIN_ID = '@forumone/throughline-integrations'
const PLUGIN_VERSION = '0.1.0'

const REGISTRY_SYMBOL = Symbol.for('@forumone/throughline/integrations-registry')
const CONTEXT_SYMBOL = Symbol.for('@forumone/throughline/integrations-context')

/**
 * Integrations server. Registers the Integrations collection, the
 * five-tool MCP server, and a process-local registry of integration
 * modules. The webhook integration is registered automatically; clients
 * extend the registry by passing additional integrations via options.
 *
 * Integration Inngest functions are not served here — they are exposed
 * via `getIntegrationRegistry(payload)` so the client app's Inngest
 * endpoint can merge them with its own functions. See
 * `docs/integrations-wiring.md` in the repository root.
 */
export const integrationsPlugin: CorePlugin<IntegrationsPluginOptions> =
  (rawOptions) => (incomingConfig) => {
    if (rawOptions.enabled === false) return incomingConfig

    const options = validateOptions(rawOptions)
    const collectionSlug = options.collectionSlug ?? DEFAULT_INTEGRATIONS_SLUG
    const logger = createNamedLogger('integrations', options.logger ?? defaultLogger)

    const registry = new IntegrationRegistry()
    registry.register(webhookIntegration as unknown as Parameters<typeof registry.register>[0])
    for (const integration of options.integrations ?? []) {
      registry.register(integration)
    }

    const collection = createIntegrationsCollection({ slug: collectionSlug, registry })

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
            return (result.docs as Array<Record<string, unknown>>).map((doc) => ({
              id: String(doc['id']),
              name: String(doc['name']),
              config: (doc['config'] ?? {}) as Config,
            }))
          },
          async updateStatus(instanceId, status, error) {
            await payload.update({
              collection: collectionSlug,
              id: instanceId,
              data: {
                lastSyncAt: new Date().toISOString(),
                lastSyncStatus: status,
                ...(error !== undefined ? { lastError: error } : { lastError: null }),
              },
            })
          },
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
          const fnCount = integration.createFunctions(context).length
          logger.info('Integration registered', {
            id: integration.id,
            inngestFunctions: fnCount,
          })
        }

        const deps = { payload, collectionSlug }
        const tools = [
          createListIntegrationsTool(deps),
          createGetIntegrationStatusTool(deps),
          createTriggerSyncTool({ ...deps, inngest: options.inngest }),
          createTestIntegrationTool({ ...deps, registry }),
          createListIntegrationTypesTool({ registry }),
        ] as unknown as McpToolDefinition[]

        // Payload's own MCP plugin, and the only transport these tools have.
        // `onInit` is both the earliest they can exist and still early enough
        // that `mcpPlugin` reads the array populated.
        options.mcpTools?.add(tools, { serverName: 'integrations', logger })

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

export function getIntegrationContext(payload: unknown): IntegrationContext | undefined {
  return (payload as Record<symbol, unknown>)[CONTEXT_SYMBOL] as IntegrationContext | undefined
}

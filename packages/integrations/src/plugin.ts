import type { CorePlugin, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import {
  createMcpHandler,
  createNamedLogger,
  defaultLogger,
  getAuditWriter,
} from '@forumone/throughline-core'
import { type IntegrationsPluginOptions, validateOptions, DEFAULT_INTEGRATIONS_SLUG } from './options.js'
import { IntegrationRegistry } from './registry.js'
import { createIntegrationsCollection } from './collection.js'
import { webhookIntegration } from './integrations/index.js'
import type { IntegrationContext } from './types.js'
import {
  createGetIntegrationStatusTool,
  createListIntegrationsTool,
  createListIntegrationTypesTool,
  createTestIntegrationTool,
  createTriggerSyncTool,
} from './tools/index.js'

const PLUGIN_ID = '@forumone/throughline-integrations'
const PLUGIN_VERSION = '0.1.0'

const MCP_HANDLER_SYMBOL = Symbol.for('@forumone/throughline/integrations-mcp-handler')
const REGISTRY_SYMBOL = Symbol.for('@forumone/throughline/integrations-registry')
const CONTEXT_SYMBOL = Symbol.for('@forumone/throughline/integrations-context')

type McpHandler = (request: Request) => Promise<Response>

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
    const routePrefix = options.routePrefix ?? '/integrations'
    const logger = createNamedLogger('integrations', options.logger ?? defaultLogger)

    const registry = new IntegrationRegistry()
    registry.register(webhookIntegration as unknown as Parameters<typeof registry.register>[0])
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
            const handler = (req.payload as unknown as Record<symbol, unknown>)[
              MCP_HANDLER_SYMBOL
            ] as McpHandler | undefined
            if (!handler) {
              return new Response(
                JSON.stringify({ error: 'Integrations MCP not initialized' }),
                { status: 503, headers: { 'content-type': 'application/json' } },
              )
            }
            return handler(req as unknown as Request)
          },
        },
      ],
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

        // Payload's own MCP plugin, when the host is using it. See the option's
        // note — `onInit` is both the earliest these tools can exist and still
        // early enough that the array is read populated.
        options.mcpTools?.add(tools, { serverName: 'integrations', logger })

        const handler = createMcpHandler({
          payload,
          serverName: 'integrations',
          tools,
          logger,
        })

        Object.defineProperty(payload, MCP_HANDLER_SYMBOL, {
          value: handler,
          enumerable: false,
          writable: false,
          configurable: false,
        })
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
          routePrefix,
          integrationCount: registry.size,
        })
      },
    }
  }

export function getIntegrationRegistry(payload: unknown): IntegrationRegistry | undefined {
  return (payload as Record<symbol, unknown>)[REGISTRY_SYMBOL] as IntegrationRegistry | undefined
}

export function getIntegrationContext(payload: unknown): IntegrationContext | undefined {
  return (payload as Record<symbol, unknown>)[CONTEXT_SYMBOL] as IntegrationContext | undefined
}

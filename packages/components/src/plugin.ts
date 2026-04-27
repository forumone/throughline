import type { CorePlugin } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import {
  createMcpHandler,
  createNamedLogger,
  defaultLogger,
  getAuditWriter,
} from '@forumone/throughline-core'
import { type ComponentsPluginOptions, validateOptions } from './options.js'
import { createManifestLoader } from './manifest-source.js'
import { createTfidfMatcher } from './matching/index.js'
import {
  createFindAntiPatternTool,
  createGetContractTool,
  createGetTokensTool,
  createGetVariantsTool,
  createListComponentsTool,
  createSuggestForIntentTool,
  createValidateCompositionTool,
} from './tools/index.js'

const PLUGIN_ID = '@forumone/throughline-components'
const PLUGIN_VERSION = '0.1.0'
const MCP_HANDLER_SYMBOL = Symbol.for('@forumone/throughline/components-mcp-handler')

type McpHandler = (request: Request) => Promise<Response>

export const componentsPlugin: CorePlugin<ComponentsPluginOptions> =
  (rawOptions) => (incomingConfig) => {
    if (rawOptions.enabled === false) return incomingConfig

    const options = validateOptions(rawOptions)
    const routePrefix = options.routePrefix ?? '/api/components'
    const logger = createNamedLogger('components', options.logger ?? defaultLogger)
    const maxRecommendations = options.matching?.maxRecommendations ?? 5

    return {
      ...incomingConfig,
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
                JSON.stringify({ error: 'Components MCP not initialized' }),
                { status: 503, headers: { 'content-type': 'application/json' } },
              )
            }
            return handler(req as unknown as Request)
          },
        },
      ],
      onInit: async (payload) => {
        if (incomingConfig.onInit) {
          await incomingConfig.onInit(payload)
        }

        const registry = getPluginRegistry(payload)
        registry.requireCapability('audit-log', PLUGIN_ID)

        const auditWriter = getAuditWriter(payload)
        const loader = createManifestLoader(options.manifest, payload)

        // Eager load: fail fast if the manifest source is broken at deploy
        // time rather than on the first request.
        const manifest = await loader.get()
        const components = Object.values(manifest.raw.components)
        logger.info('Manifest loaded', {
          designSystem: manifest.designSystem.name,
          version: manifest.designSystem.version,
          componentCount: components.length,
        })

        const matcher = createTfidfMatcher(components)

        const tools = [
          createListComponentsTool(loader),
          createGetContractTool(loader),
          createGetVariantsTool(loader),
          createGetTokensTool(loader),
          createSuggestForIntentTool({ loader, matcher, auditWriter, maxRecommendations }),
          createValidateCompositionTool({ loader, auditWriter }),
          createFindAntiPatternTool({ loader, auditWriter }),
        ]

        const handler = createMcpHandler({
          payload,
          serverName: 'components',
          tools,
          logger,
        })

        attachMcpHandler(payload, handler)

        registry.register({
          id: PLUGIN_ID,
          version: PLUGIN_VERSION,
          capabilities: ['component-server', 'manifest-loading', 'intent-matching'],
        })
      },
    }
  }

function attachMcpHandler(payload: object, handler: McpHandler): void {
  Object.defineProperty(payload, MCP_HANDLER_SYMBOL, {
    value: handler,
    enumerable: false,
    writable: false,
    configurable: false,
  })
}

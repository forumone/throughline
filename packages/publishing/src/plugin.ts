import type { CollectionConfig } from 'payload'
import type { CorePlugin } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import {
  createMcpHandler,
  createNamedLogger,
  defaultLogger,
  getAuditWriter,
} from '@forumone/throughline-core'
import { type PublishingPluginOptions, validateOptions } from './options.js'
import { createBlockStatusWritesHook } from './hooks/block-status-writes.js'
import {
  createGetPublishStatusTool,
  createPublishTool,
  createRollbackTool,
  createSchedulePublishTool,
  createUnpublishTool,
} from './tools/index.js'

const PLUGIN_ID = '@forumone/throughline-publishing'
const PLUGIN_VERSION = '0.1.0'
const MCP_HANDLER_SYMBOL = Symbol.for('@forumone/throughline/publishing-mcp-handler')

type McpHandler = (request: Request) => Promise<Response>

export const publishingPlugin: CorePlugin<PublishingPluginOptions> =
  (rawOptions) => (incomingConfig) => {
    if (rawOptions.enabled === false) return incomingConfig

    const options = validateOptions(rawOptions)
    // Payload prepends `config.routes.api` (default `/api`); paths here must
    // not start with /api or they'll be doubled.
    const routePrefix = options.routePrefix ?? '/publishing'
    const logger = createNamedLogger('publishing', options.logger ?? defaultLogger)
    const publishableSlugs = new Set(options.collections.map((c) => c.slug))

    // Inject the block-status-writes hook into every publishable collection.
    const modifiedCollections = (incomingConfig.collections ?? []).map((collection) => {
      if (!publishableSlugs.has(collection.slug)) return collection
      return {
        ...collection,
        hooks: {
          ...(collection.hooks ?? {}),
          beforeChange: [
            ...(collection.hooks?.beforeChange ?? []),
            createBlockStatusWritesHook(),
          ],
        },
      } satisfies CollectionConfig
    })

    return {
      ...incomingConfig,
      collections: modifiedCollections,
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
                JSON.stringify({ error: 'Publishing MCP not initialized' }),
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

        const tools = [
          createPublishTool({ payload, options, auditWriter }),
          createUnpublishTool({ payload, options, auditWriter }),
          createSchedulePublishTool({ payload, options, auditWriter }),
          createGetPublishStatusTool({ payload, options }),
          createRollbackTool({ payload, options, auditWriter }),
        ]

        const handler = createMcpHandler({
          payload,
          serverName: 'publishing',
          tools,
          logger,
        })

        Object.defineProperty(payload, MCP_HANDLER_SYMBOL, {
          value: handler,
          enumerable: false,
          writable: false,
          configurable: false,
        })

        registry.register({
          id: PLUGIN_ID,
          version: PLUGIN_VERSION,
          capabilities: ['publishing', 'publish-pipeline'],
        })

        logger.info('Publishing server ready', {
          collections: options.collections.map((c) => c.slug),
        })
      },
    }
  }

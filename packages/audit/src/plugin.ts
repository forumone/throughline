import type { CorePlugin, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import { createMcpHandler, createNamedLogger, defaultLogger } from '@forumone/throughline-core'
import {
  type AuditQueryPluginOptions,
  DEFAULT_AUDIT_COLLECTION_SLUG,
  validateOptions,
} from './options.js'
import {
  createGetChangeHistoryTool,
  createGetRecentFailuresTool,
  createQueryAuditTool,
  createWhatChangedInRangeTool,
  createWhoChangedWhatTool,
} from './tools/index.js'

const PLUGIN_ID = '@forumone/throughline-audit'
const PLUGIN_VERSION = '0.1.0'
const MCP_HANDLER_SYMBOL = Symbol.for('@forumone/throughline/audit-mcp-handler')

type McpHandler = (request: Request) => Promise<Response>

/**
 * Read-only MCP server over the audit log. Pairs with `auditPlugin` from
 * `@forumone/throughline-core` (which writes records). The query plugin
 * requires the `audit-log` capability and refuses to initialize without it.
 *
 * Exported as `auditQueryPlugin` to disambiguate from core's `auditPlugin`.
 */
export const auditQueryPlugin: CorePlugin<AuditQueryPluginOptions> =
  (rawOptions) => (incomingConfig) => {
    if (rawOptions.enabled === false) return incomingConfig

    const options = validateOptions(rawOptions)
    const routePrefix = options.routePrefix ?? '/audit'
    const collectionSlug = options.collectionSlug ?? DEFAULT_AUDIT_COLLECTION_SLUG
    const logger = createNamedLogger('audit-query', options.logger ?? defaultLogger)

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
                JSON.stringify({ error: 'Audit query MCP not initialized' }),
                { status: 503, headers: { 'content-type': 'application/json' } },
              )
            }
            return handler(req as unknown as Request)
          },
        },
      ],
      onInit: async (payload) => {
        if (incomingConfig.onInit) await incomingConfig.onInit(payload)

        const registry = getPluginRegistry(payload)
        registry.requireCapability('audit-log', PLUGIN_ID)

        const deps = { payload, collectionSlug }
        const tools = [
          createQueryAuditTool(deps),
          createGetChangeHistoryTool(deps),
          createWhoChangedWhatTool(deps),
          createWhatChangedInRangeTool(deps),
          createGetRecentFailuresTool(deps),
        ] as unknown as McpToolDefinition[]

        // Payload's own MCP plugin, when the host is using it. See the option's
        // note — `onInit` is both the earliest these tools can exist and still
        // early enough that the array is read populated.
        options.mcpTools?.add(tools, { serverName: 'audit', logger })

        const handler = createMcpHandler({
          payload,
          serverName: 'audit',
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
          capabilities: ['audit-query'],
        })

        logger.info('Audit query server ready', {
          collectionSlug,
          routePrefix,
          toolCount: tools.length,
        })
      },
    }
  }

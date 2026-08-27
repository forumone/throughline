import type { CorePlugin } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import {
  createMcpHandler,
  createNamedLogger,
  defaultLogger,
  getAuditWriter,
} from '@forumone/throughline-core'
import { type ApprovalsPluginOptions, validateOptions } from './options.js'
import { createApprovalsCollection } from './collection.js'
import { attachApprovalResolver, createApprovalResolver } from './resolver.js'
import { createActionEndpoint } from './endpoints/action.js'
import {
  createGetApprovalStatusTool,
  createListMyRequestsTool,
  createListPendingApprovalsTool,
  createRequestApprovalTool,
  createRespondToApprovalTool,
} from './tools/index.js'

const PLUGIN_ID = '@forumone/throughline-approvals'
const PLUGIN_VERSION = '0.1.0'
const MCP_HANDLER_SYMBOL = Symbol.for('@forumone/throughline/approvals-mcp-handler')
const ACTION_HANDLER_SYMBOL = Symbol.for('@forumone/throughline/approvals-action-handler')

type McpHandler = (request: Request) => Promise<Response>

export const approvalsPlugin: CorePlugin<ApprovalsPluginOptions> =
  (rawOptions) => (incomingConfig) => {
    if (rawOptions.enabled === false) return incomingConfig

    const options = validateOptions(rawOptions)
    const routePrefix = options.routePrefix ?? '/approvals'
    const logger = createNamedLogger('approvals', options.logger ?? defaultLogger)

    const collection = createApprovalsCollection({
      ...(options.collectionSlug ? { slug: options.collectionSlug } : {}),
      ...(options.usersSlug ? { usersSlug: options.usersSlug } : {}),
      groupSlugs: options.groups.map((g) => g.slug),
    })

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
                JSON.stringify({ error: 'Approvals MCP not initialized' }),
                { status: 503, headers: { 'content-type': 'application/json' } },
              )
            }
            return handler(req as unknown as Request)
          },
        },
        {
          path: `${routePrefix}/action`,
          method: 'get',
          handler: async (req) => {
            const actionHandler = (req.payload as unknown as Record<symbol, unknown>)[
              ACTION_HANDLER_SYMBOL
            ] as ((r: typeof req) => Promise<Response>) | undefined
            if (!actionHandler) {
              return new Response('Approvals action handler not initialized', { status: 503 })
            }
            return actionHandler(req)
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

        const collectionSlug = options.collectionSlug
        const resolver = createApprovalResolver(
          collectionSlug ? { payload, collectionSlug } : { payload },
        )
        attachApprovalResolver(payload, resolver)

        const actionEndpoint = createActionEndpoint({ options, auditWriter })
        Object.defineProperty(payload, ACTION_HANDLER_SYMBOL, {
          value: actionEndpoint.handler,
          enumerable: false,
          writable: false,
          configurable: false,
        })

        const tools = [
          createRequestApprovalTool({ payload, options, auditWriter }),
          createRespondToApprovalTool({ payload, options, auditWriter }),
          createGetApprovalStatusTool({ payload, options }),
          createListPendingApprovalsTool({ payload, options }),
          createListMyRequestsTool({ payload, options }),
        ]

        // Payload's own MCP plugin, when the host is using it. See the option's
        // note — `onInit` is both the earliest these tools can exist and still
        // early enough that the array is read populated.
        options.mcpTools?.add(tools, { serverName: 'approvals', logger })

        const handler = createMcpHandler({
          payload,
          serverName: 'approvals',
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
          capabilities: ['approvals', 'approval-resolver'],
        })

        logger.info('Approvals server ready', {
          groups: options.groups.map((g) => g.slug),
          expirationDays: options.expirationDays ?? 7,
        })
      },
    }
  }

// `createActionEndpoint` is exported from src/index.ts for clients who want
// to expose the action handler separately (e.g. behind a branded router).
// Most consumers won't need it — the plugin already registers the action
// endpoint at `${routePrefix}/action`.

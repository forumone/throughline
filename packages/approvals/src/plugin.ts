import type { CorePlugin } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import { createNamedLogger, defaultLogger, getAuditWriter } from '@forumone/throughline-core'
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
const ACTION_HANDLER_SYMBOL = Symbol.for('@forumone/throughline/approvals-action-handler')

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

        // Payload's own MCP plugin, and the only transport these tools have.
        // `onInit` is both the earliest they can exist and still early enough
        // that `mcpPlugin` reads the array populated.
        options.mcpTools?.add(tools, { serverName: 'approvals', logger })

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

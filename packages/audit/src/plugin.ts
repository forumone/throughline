import type { CorePlugin, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'
import { createNamedLogger, defaultLogger, getAuditWriter } from '@forumone/throughline-core'
import {
  type AuditQueryPluginOptions,
  DEFAULT_AUDIT_COLLECTION_SLUG,
  validateOptions,
} from './options.js'
import {
  AUDIT_TOOL_DESCRIPTORS,
  createGetChangeHistoryTool,
  createGetRecentFailuresTool,
  createQueryAuditTool,
  createWhatChangedInRangeTool,
  createWhoChangedWhatTool,
} from './tools/index.js'

const PLUGIN_ID = '@forumone/throughline-audit'
const PLUGIN_VERSION = '0.1.0'
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
    const collectionSlug = options.collectionSlug ?? DEFAULT_AUDIT_COLLECTION_SLUG
    const logger = createNamedLogger('audit-query', options.logger ?? defaultLogger)

    /*
    Declared here, bound at `onInit` — `mcpPlugin` generates its per-key
    checkboxes from these names and descriptions while the config is built, and
    denies any tool it has no checkbox for. This plugin must therefore come
    before `mcpPlugin` in the host's array.
    */
    options.mcpTools?.declare(AUDIT_TOOL_DESCRIPTORS, { serverName: 'audit' })

    return {
      ...incomingConfig,
      onInit: async (payload) => {
        if (incomingConfig.onInit) await incomingConfig.onInit(payload)

        const registry = getPluginRegistry(payload)
        registry.requireCapability('audit-log', PLUGIN_ID)

        /*
        The audit server audits its own crashes. That reads circular and is
        not: these five tools only read, so a `system.error` row from one of
        them records that reading the log failed — which is precisely the
        outage you would otherwise have no record of, because the place you
        would look is the thing that broke.
        */
        const auditWriter = getAuditWriter(payload)
        const deps = { payload, collectionSlug }
        const tools = [
          createQueryAuditTool(deps),
          createGetChangeHistoryTool(deps),
          createWhoChangedWhatTool(deps),
          createWhatChangedInRangeTool(deps),
          createGetRecentFailuresTool(deps),
        ] as unknown as McpToolDefinition[]

        // Payload's own MCP plugin, and the only transport these tools have.
        // `onInit` is both the earliest they can exist and still early enough
        // that `mcpPlugin` reads the array populated.
        options.mcpTools?.add(tools, { serverName: 'audit', logger, audit: auditWriter })

        registry.register({
          id: PLUGIN_ID,
          version: PLUGIN_VERSION,
          capabilities: ['audit-query'],
        })

        logger.info('Audit query server ready', {
          collectionSlug,
          toolCount: tools.length,
        })
      },
    }
  }

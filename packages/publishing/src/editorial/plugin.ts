import type { Config, Plugin } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { McpToolCollector } from '@forumone/throughline-core'
import { EDITORIAL_CUSTOM_KEY, type EditorialRuntime } from './config.js'
import type { HealthCheck } from './health/checks.js'
import { HEALTH_TOOL_DESCRIPTORS, createFindContentNeedingAttentionTool } from './health/tool.js'

export interface EditorialPluginOptions {
  enabled?: boolean
  /** The content-health view, its dashboard summary and `find_content_needing_attention`. */
  health?: {
    checks: readonly HealthCheck[]
    /** Where the view lives under the admin route. Default `/content-health`. */
    path?: string
  }
  /** Where the tools go. Omit for none. Must come before `mcpPlugin`. */
  mcpTools?: McpToolCollector
}

/** The view's import-map path. */
export const CONTENT_HEALTH_VIEW_PATH = '@forumone/throughline-publishing/rsc#ContentHealthView'

/**
 * Editorial views for the admin, each with an MCP tool that returns the same
 * rows. 1.0 P2 moves these from forumone-2026 one at a time; content health is
 * the first.
 *
 * ```ts
 * editorialPlugin({
 *   health: {
 *     checks: [
 *       staleCheck({ after: { pages: 12 } }),
 *       missingSeoCheck({ collections: ['pages', 'posts'] }),
 *       missingAltCheck({ inUse: findReferencedIds }),
 *     ],
 *   },
 *   mcpTools,
 * })
 * ```
 */
export function editorialPlugin(options: EditorialPluginOptions): Plugin {
  return (incoming: Config): Config => {
    if (options.enabled === false) return incoming

    const runtime: EditorialRuntime = {}
    let config: Config = incoming

    if (options.health) {
      const { checks } = options.health
      const path = options.health.path ?? '/content-health'
      const ids = checks.map((check) => check.id)
      const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
      if (duplicate)
        throw new Error(`editorialPlugin: two health checks share the id "${duplicate}".`)

      runtime.health = { checks, path }
      config = {
        ...config,
        admin: {
          ...config.admin,
          components: {
            ...config.admin?.components,
            views: {
              ...config.admin?.components?.views,
              contentHealth: {
                Component: CONTENT_HEALTH_VIEW_PATH,
                path: path as `/${string}`,
                meta: { title: 'Content health' },
              },
            },
          },
        },
      }
      options.mcpTools?.declare(HEALTH_TOOL_DESCRIPTORS, { serverName: 'editorial' })
    }

    return {
      ...config,
      custom: { ...config.custom, [EDITORIAL_CUSTOM_KEY]: runtime },
      onInit: async (payload) => {
        if (config.onInit) await config.onInit(payload)
        if (options.mcpTools && runtime.health) {
          options.mcpTools.add(
            [
              createFindContentNeedingAttentionTool({ payload, checks: runtime.health.checks }),
            ] as unknown as McpToolDefinition[],
            { serverName: 'editorial' },
          )
        }
      },
    }
  }
}

import type { Config } from 'payload'
import type { BaseCorePluginOptions, CorePlugin } from './index.js'
import { getPluginRegistry } from './registry.js'

/**
 * EXAMPLE ONLY — not a real plugin. Reference implementation showing the
 * shape every Throughline core plugin follows. Every future plugin should
 * lift this structure and fill in the feature-specific parts.
 */

export interface ExamplePluginOptions extends BaseCorePluginOptions {
  /** A plugin-specific option. */
  greeting?: string
}

const EXAMPLE_PLUGIN_ID = '@forumone/throughline-example'
const EXAMPLE_PLUGIN_VERSION = '0.0.0'

export const examplePlugin: CorePlugin<ExamplePluginOptions> = (options) => {
  return (incomingConfig: Config): Config => {
    // Step 1 — honour the disabled flag before doing any work.
    if (options.enabled === false) return incomingConfig

    // Step 2 — apply defaults. Note: route prefixes here MUST NOT include
    // `/api` — Payload mounts top-level endpoints under its API base
    // (default `/api`), so the user-facing URL becomes `/api/example/mcp`.
    const greeting = options.greeting ?? 'Hello'
    const routePrefix = options.routePrefix ?? '/example'

    // Step 3 — extend the incoming config by spreading and appending.
    //          Never replace existing arrays; always concatenate.
    return {
      ...incomingConfig,
      collections: [
        ...(incomingConfig.collections ?? []),
        // Plugin's own collections go here.
      ],
      endpoints: [
        ...(incomingConfig.endpoints ?? []),
        {
          path: `${routePrefix}/mcp`,
          method: 'post',
          handler: async () => {
            // Real plugins delegate this to an MCP server implementation.
            return new Response(JSON.stringify({ greeting }), {
              headers: { 'content-type': 'application/json' },
            })
          },
        },
      ],
      hooks: {
        ...(incomingConfig.hooks ?? {}),
        afterError: [
          ...(incomingConfig.hooks?.afterError ?? []),
          // Plugin's global error hooks go here.
        ],
      },
      onInit: async (payload) => {
        // Always run any pre-existing onInit first so plugins compose cleanly.
        if (incomingConfig.onInit) {
          await incomingConfig.onInit(payload)
        }

        // Announce presence and assert required capabilities from siblings.
        const registry = getPluginRegistry(payload)
        registry.register({
          id: EXAMPLE_PLUGIN_ID,
          version: EXAMPLE_PLUGIN_VERSION,
          capabilities: ['example'],
        })
      },
    }
  }
}

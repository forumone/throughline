import type { Config } from 'payload'
import type { BaseCorePluginOptions, CorePlugin } from '@forumone/throughline-plugin-contract'
import { getPluginRegistry } from '@forumone/throughline-plugin-contract'

/*
Moved here from `@forumone/throughline-plugin-contract`, which published it to
every consumer. It is documentation of a shape, and the playground is where a
shape gets demonstrated — a published package carrying an example nobody imports
is 74 lines of weight on everyone who installs it.
*/

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
    // (default `/api`), so the user-facing URL becomes `/api/example/greeting`.
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
        /*
        An ordinary HTTP endpoint, and deliberately not an MCP one.

        A plugin does not serve MCP itself any more. It builds its tools at
        `onInit` — the first moment they can close over `payload` — and hands
        them to the collector the host passed in, which the host has already
        given to `@payloadcms/plugin-mcp`. One `/api/mcp` for every server.
        Endpoints like this are for the things MCP is not: admin controls,
        webhooks, public form posts.
        */
        {
          path: `${routePrefix}/greeting`,
          method: 'get',
          handler: async () => {
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

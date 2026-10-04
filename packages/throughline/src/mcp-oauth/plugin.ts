import type { Config, Plugin } from 'payload'
import { REPORTS_NAV_PATH } from '../editorial/plugin.js'
import { createOverrideAuth, type OverrideAuth } from './auth.js'
import { accessGlobal, clientsCollection, grantsCollection } from './collections.js'
import { oauthEndpoints, type EndpointOptions } from './endpoints.js'
import {
  createRuntime,
  MCP_OAUTH_CUSTOM_KEY,
  type McpOAuthOptions,
  type McpOAuthRuntime,
} from './runtime.js'

export const CONNECT_MCP_VIEW_PATH = '@forumone/throughline/rsc#ConnectMcpView'
export const MCP_AUTHORIZE_VIEW_PATH = '@forumone/throughline/rsc#McpAuthorizeView'

export interface McpOAuth {
  /** Registers the endpoints, the collections, the policy and the admin pages. */
  plugin: Plugin
  /** For `mcpPlugin({ overrideAuth })`. */
  overrideAuth: OverrideAuth
  runtime: McpOAuthRuntime
}

/**
 * OAuth sign-in for `/api/mcp`: a person adds the server's URL to Claude or
 * ChatGPT, signs in to the admin as themselves, and allows the connection. No
 * key to copy.
 *
 * ```ts
 * const oauth = mcpOAuth({ serverURL, serverName: 'Example', tools: mcpTools, prompts: mcpPrompts,
 *   isAdmin, eligible })
 *
 * plugins: [
 *   ...throughline plugins,           // declare the tools first
 *   oauth.plugin,
 *   mcpPlugin({ mcp: { tools: mcpTools, prompts: mcpPrompts }, overrideAuth: oauth.overrideAuth }),
 * ]
 * ```
 *
 * And in `next.config`, `rewrites: async () => mcpOAuthRewrites()`, so the
 * discovery documents are found at `/.well-known`.
 *
 * API keys keep working beside it: a bearer token that is not one of these is
 * handed to the plugin's own key lookup.
 */
export function mcpOAuth(
  options: McpOAuthOptions,
  endpointOptions: EndpointOptions = {},
): McpOAuth {
  const runtime = createRuntime(options)

  const plugin: Plugin = (incoming: Config): Config => {
    /*
    The tool names are read now, not when `mcpOAuth` was called: the modules
    declare theirs while the config is built, so this plugin has to come after
    them, and an empty list here means it did not.
    */
    if (runtime.tools.length === 0) {
      throw new Error(
        'mcpOAuth(): no MCP tools had been declared when its plugin ran. Register it after the plugins that declare tools (throughline()), and hand it the same array mcpPlugin serves.',
      )
    }
    const served = new Set(runtime.tools.map((tool) => tool.name))
    runtime.defaults.editorTools = runtime.defaults.editorTools.filter((name) => served.has(name))

    const group = options.adminGroup ?? 'Admin'
    const views = incoming.admin?.components?.views ?? {}

    return {
      ...incoming,
      collections: [
        ...(incoming.collections ?? []),
        clientsCollection(runtime, group),
        grantsCollection(runtime, group),
      ],
      globals: [...(incoming.globals ?? []), accessGlobal(runtime, group)],
      endpoints: [...(incoming.endpoints ?? []), ...oauthEndpoints(runtime, endpointOptions)],
      admin: {
        ...incoming.admin,
        components: {
          ...incoming.admin?.components,
          views: {
            ...views,
            connectMcp: {
              Component: CONNECT_MCP_VIEW_PATH,
              path: runtime.connectPath as `/${string}`,
              exact: true,
              meta: { title: 'Connect MCP' },
            },
            mcpAuthorize: {
              Component: MCP_AUTHORIZE_VIEW_PATH,
              path: `${runtime.connectPath}/authorize` as `/${string}`,
              exact: true,
              meta: { title: `Connect an app to ${runtime.serverName}` },
            },
          },
          afterNavLinks: [
            ...(incoming.admin?.components?.afterNavLinks ?? []),
            {
              path: REPORTS_NAV_PATH,
              clientProps: {
                label: 'MCP',
                reports: [{ path: runtime.connectPath, label: 'Connect MCP' }],
              },
            },
          ],
        },
      },
      custom: { ...incoming.custom, [MCP_OAUTH_CUSTOM_KEY]: runtime },
    }
  }

  return { plugin, overrideAuth: createOverrideAuth(runtime), runtime }
}

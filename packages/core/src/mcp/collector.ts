import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { toPayloadMcpTools, type PayloadMcpTool, type ToPayloadMcpToolOptions } from './payload-mcp.js'

/*
The one wiring problem between Throughline's tools and Payload's MCP plugin.

`@payloadcms/plugin-mcp` takes its tools as a config option. Every Throughline
tool is built at `onInit`, because every one of them closes over `payload` — the
service, the audit writer, the manifest loader. At the moment the host writes its
config there is nothing to hand over.

What makes this solvable rather than a rewrite: the plugin reads `mcp.tools`
*inside the handler it builds per request*, not once at startup. So an array
handed over at config time and filled at `onInit` — which runs before any
request — is read populated.

This is that array, with the adapter attached to it:

    const mcpTools = createMcpToolCollector()

    plugins: [
      publishingPlugin({ …, mcpTools }),
      approvalsPlugin({ …, mcpTools }),
      mcpPlugin({ mcp: { tools: mcpTools.tools } }),
    ]

A plugin given no collector behaves exactly as before, which is what lets a host
move one server at a time instead of all six at once.
*/

export interface McpToolCollector {
  /**
   * The array to hand `mcpPlugin`. Empty until the plugins initialise, and the
   * same array afterwards — do not copy or spread it at config time, or the
   * tools will be added to something nobody reads.
   */
  readonly tools: PayloadMcpTool[]
  /** Called by a plugin at `onInit`, once it can build its tools. */
  add(tools: McpToolDefinition[], options?: AddToolsOptions): void
  /** Which servers have contributed, in the order they initialised. */
  readonly servers: string[]
}

export interface AddToolsOptions extends ToPayloadMcpToolOptions {
  /**
   * Which server these came from — `'publishing'`, `'approvals'`. Used to name
   * both sides of a duplicate-name collision, which is the only thing that
   * makes that error actionable.
   */
  serverName?: string
}

export type CreateMcpToolCollectorOptions = ToPayloadMcpToolOptions

/**
 * Somewhere for the plugins to put their tools, that the host can pass to
 * Payload's MCP plugin before they exist.
 *
 * Duplicate names are refused rather than silently shadowed. Six servers that
 * each named their own `publish` were fine while each had its own endpoint; one
 * server means one namespace, and an MCP client offered two tools with one name
 * gets whichever registered last.
 */
export function createMcpToolCollector(
  options: CreateMcpToolCollectorOptions = {},
): McpToolCollector {
  const tools: PayloadMcpTool[] = []
  const servers: string[] = []
  const byName = new Map<string, string>()

  return {
    tools,
    servers,
    add(incoming, addOptions = {}) {
      const { serverName = 'an unnamed server', ...toolOptions } = addOptions

      for (const tool of incoming) {
        const existing = byName.get(tool.name)
        if (existing !== undefined) {
          throw new Error(
            `Two MCP tools are called "${tool.name}" — one from ${existing}, one from ` +
              `${serverName}. Under a single MCP server a tool name is a namespace, and a client ` +
              `offered both gets whichever registered last. Rename one.`,
          )
        }
        byName.set(tool.name, serverName)
      }

      tools.push(...toPayloadMcpTools(incoming, { ...options, ...toolOptions }))
      servers.push(serverName)
    },
  }
}

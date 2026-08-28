import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { toPayloadMcpTools, type PayloadMcpTool, type ToPayloadMcpToolOptions } from './payload-mcp.js'

/*
The one wiring problem between Throughline's tools and Payload's MCP plugin,
and why it takes two steps rather than one.

`@payloadcms/plugin-mcp` takes its tools as a config option. Every Throughline
tool is built at `onInit`, because every one of them closes over `payload` — the
service, the audit writer, the manifest loader. At the moment the host writes its
config there is nothing to hand over.

What makes this solvable rather than a rewrite: the plugin reads `mcp.tools`
*inside the handler it builds per request*, not once at startup. So an array
handed over at config time and filled at `onInit` — which runs before any
request — is read populated.

**But the plugin also reads that array once at config time**, and for something
else: it maps over it to generate a per-key checkbox on its own key collection,
one per tool, and gates every call on the checkbox matching the tool's name:

    mcpAccessSettings['payload-mcp-tool']?.[toCamelCase(tool.name)] ?? false

An array that is empty at that moment produces no checkboxes, and that `?? false`
then denies every tool to every key — a valid key, a 200, and an empty
`tools/list`, with nothing wrong on either side. The first consumer worked around
it by overriding auth to enable everything.

The fix is that the plugin needs only `name` and `description` then, and both are
constants: only the *handler* needs `payload`. So a server declares its tools at
config time and binds their handlers at `onInit`:

    const mcpTools = createMcpToolCollector()

    plugins: [
      publishingPlugin({ …, mcpTools }),   // declares at config time,
      approvalsPlugin({ …, mcpTools }),    // binds at onInit
      mcpPlugin({ mcp: { tools: mcpTools.tools } }),
    ]

**Order in that array is load-bearing.** Payload applies plugins in order, so
every server must come before `mcpPlugin` — otherwise the declarations happen
after it has already generated its fields, and the checkboxes are missing again.
*/

/** What `plugin-mcp` needs about a tool while the config is being built. */
export interface McpToolDescriptor {
  name: string
  description: string
}

export interface McpToolCollector {
  /**
   * The array to hand `mcpPlugin`. Filled by `declare` at config time and
   * completed by `add` at `onInit` — and the same array throughout, so do not
   * copy or spread it, or the tools will be added to something nobody reads.
   */
  readonly tools: PayloadMcpTool[]
  /**
   * Called by a plugin as the config is built, with its tools' names and
   * descriptions. This is what `plugin-mcp` turns into per-key checkboxes.
   */
  declare(descriptors: readonly McpToolDescriptor[], options?: DeclareToolsOptions): void
  /** Called by a plugin at `onInit`, once it can build its handlers. */
  add(tools: McpToolDefinition[], options?: AddToolsOptions): void
  /** Which servers have declared, in the order they did. */
  readonly servers: string[]
  /**
   * Tools declared and never bound. Empty after every server's `onInit` has
   * run; anything left is a server that declared a tool it does not build.
   */
  readonly unbound: string[]
}

export interface DeclareToolsOptions {
  /**
   * Which server these came from — `'publishing'`, `'approvals'`. Used to name
   * both sides of a duplicate-name collision, which is the only thing that
   * makes that error actionable.
   */
  serverName?: string
}

export interface AddToolsOptions extends ToPayloadMcpToolOptions, DeclareToolsOptions {}

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
  const declaredBy = new Map<string, string>()
  const slots = new Map<string, PayloadMcpTool>()
  const bound = new Set<string>()

  return {
    tools,
    servers,
    get unbound() {
      return [...declaredBy.keys()].filter(name => !bound.has(name))
    },

    declare(descriptors, declareOptions = {}) {
      const { serverName = 'an unnamed server' } = declareOptions

      for (const descriptor of descriptors) {
        const existing = declaredBy.get(descriptor.name)
        if (existing !== undefined) {
          throw new Error(
            `Two MCP tools are called "${descriptor.name}" — one from ${existing}, one from ` +
              `${serverName}. Under a single MCP server a tool name is a namespace, and a client ` +
              `offered both gets whichever registered last. Rename one.`,
          )
        }
        declaredBy.set(descriptor.name, serverName)

        /*
        A slot, not a tool. `name` and `description` are everything the plugin
        reads now; `parameters` and `handler` arrive at `onInit`, on this same
        object, because the array identity is what the host handed over.
        */
        const slot: PayloadMcpTool = {
          name: descriptor.name,
          description: descriptor.description,
          parameters: {},
          handler: () => {
            throw new Error(
              `MCP tool "${descriptor.name}" was declared by ${serverName} and never bound. ` +
                `A server declares its tools as the config is built and binds their handlers at ` +
                `onInit; this one did not reach the second step, so the tool is advertised and ` +
                `cannot run.`,
            )
          },
        }
        slots.set(descriptor.name, slot)
        tools.push(slot)
      }

      servers.push(serverName)
    },

    add(incoming, addOptions = {}) {
      const { serverName = 'an unnamed server', ...toolOptions } = addOptions

      for (const tool of toPayloadMcpTools(incoming, { ...options, ...toolOptions })) {
        const slot = slots.get(tool.name)
        if (!slot) {
          throw new Error(
            `${serverName} built an MCP tool called "${tool.name}" that it never declared. ` +
              `Add it to that package's tool descriptors: a tool the collector does not know ` +
              `about while the config is built gets no per-key checkbox, and \`plugin-mcp\` ` +
              `then denies it to every key with no error anywhere.`,
          )
        }

        /*
        Mutated rather than replaced. `mcpPlugin` was handed this array at config
        time and reads it per request; swapping the element would leave the
        checkbox pointing at an object nobody serves.
        */
        slot.description = tool.description
        slot.parameters = tool.parameters
        slot.handler = tool.handler
        bound.add(tool.name)
      }
    },
  }
}

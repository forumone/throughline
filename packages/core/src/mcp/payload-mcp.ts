import { z } from 'zod'
import type { Logger, McpToolContext, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { defaultLogger } from '../logger/index.js'

/*
Throughline's tools, in the shape `@payloadcms/plugin-mcp` takes.

**Why this exists.** Payload now ships an MCP server of its own —
`@payloadcms/plugin-mcp`, exact-pinned to the Payload version — built on the
official SDK, with streamable HTTP, sessions, per-key capability checkboxes and
generic CRUD tools derived from the field configs. Against that,
`createMcpHandler` in this package is a 146-line JSON-RPC subset that speaks
`tools/list` and `tools/call` and nothing else, mounted six times over.

The transport was never the product. The tools are: a publish pipeline with
policy gates, approvals, component contracts, an audit trail. Those stay ours;
what carries them does not have to be.

This adapter is what makes that swap a configuration change rather than a
rewrite of every tool. It is not wired into anything by default — the playground
demonstrates it, and the servers move over one at a time.
*/

/** The tool shape `plugin-mcp` accepts under its `mcp.tools` option. */
export interface PayloadMcpTool {
  name: string
  description: string
  parameters: z.ZodRawShape
  handler: (
    args: Record<string, unknown>,
    req: PayloadMcpRequest,
    extra: unknown,
  ) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
}

/**
 * The half of `PayloadRequest` this adapter reads.
 *
 * Declared structurally rather than imported so `core` keeps `payload` a peer
 * it does not name in a type position — and because `payloadAPI` is a module
 * augmentation `plugin-mcp` adds, which is only present when that package is
 * installed.
 */
export interface PayloadMcpRequest {
  user?: { id?: unknown; email?: unknown; name?: unknown; roles?: unknown; groups?: unknown } | null
  payloadAPI?: string
  payload?: { logger?: Logger }
}

export interface ToPayloadMcpToolOptions {
  /**
   * What to record as the calling key's name.
   *
   * `plugin-mcp` authenticates against its own key collection and puts the user
   * on the request, not the key — so unlike this package's handler, the key's
   * own name is not recoverable from the request. Pass one if the audit trail
   * should name something more useful than the strategy.
   */
  apiKeyName?: string
  logger?: Logger
}

/**
 * Wraps one Throughline tool so Payload's MCP plugin can serve it.
 *
 * Three things are being translated, and none of them is the tool's logic:
 *
 * - **The schema.** `plugin-mcp` wants the raw shape; `withMeta` produces a
 *   `z.object` around it. `.shape` is the whole conversion, which is why tools
 *   must build their input with `withMeta` or `z.object` rather than an
 *   arbitrary `ZodType`.
 * - **The context.** Payload hands the handler a request. Throughline's tools
 *   take a `McpToolContext`, so one is built from it.
 * - **The result.** Payload wants MCP content blocks; Throughline's tools
 *   return their own objects, exactly as they do through this package's own
 *   handler, which does the same wrapping a layer up.
 */
export function toPayloadMcpTool(
  tool: McpToolDefinition,
  options: ToPayloadMcpToolOptions = {},
): PayloadMcpTool {
  const shape = shapeOf(tool)

  return {
    name: tool.name,
    description: tool.description,
    parameters: shape,
    handler: async (args, req) => {
      const result = await tool.handler(args, contextFrom(req, options))
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  }
}

/** Every tool in a server, in one call. */
export function toPayloadMcpTools(
  tools: McpToolDefinition[],
  options: ToPayloadMcpToolOptions = {},
): PayloadMcpTool[] {
  return tools.map(tool => toPayloadMcpTool(tool, options))
}

function shapeOf(tool: McpToolDefinition): z.ZodRawShape {
  const schema = tool.inputSchema
  if (schema instanceof z.ZodObject) return schema.shape as z.ZodRawShape
  throw new Error(
    `Tool "${tool.name}" has an input schema that is not a z.object, so it has no shape to hand ` +
      `Payload's MCP plugin. Build tool inputs with \`withMeta({ … })\` or \`z.object({ … })\`.`,
  )
}

function contextFrom(req: PayloadMcpRequest, options: ToPayloadMcpToolOptions): McpToolContext {
  const user = req.user
    ? {
        id: String(req.user.id ?? ''),
        email: String(req.user.email ?? ''),
        name: String(req.user.name ?? req.user.email ?? ''),
        roles: Array.isArray(req.user.roles) ? (req.user.roles as string[]) : [],
        groups: Array.isArray(req.user.groups) ? (req.user.groups as string[]) : [],
      }
    : null

  return {
    user,
    /*
    The strategy name is the honest fallback. `plugin-mcp` resolves a key to its
    linked user and does not carry the key document forward, so "which key" is
    not a question the request can answer — and an audit row saying
    `mcp-api-key` is better than one asserting a name nothing checked.
    */
    apiKeyName: options.apiKeyName ?? (req.payloadAPI === 'MCP' ? 'mcp-api-key' : ''),
    logger: options.logger ?? req.payload?.logger ?? defaultLogger,
  }
}

import { z } from 'zod'
import type { Logger, McpToolContext, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { AuditMcpServer } from '../audit/types.js'
import type { AuditWriter } from '../audit/writer.js'
import { defaultLogger } from '../logger/index.js'
import { auditContext } from './audit-context.js'
import { McpMetaSchema } from './meta.js'

/*
Throughline's tools, in the shape `@payloadcms/plugin-mcp` takes.

**Why this exists.** Payload ships an MCP server of its own —
`@payloadcms/plugin-mcp`, exact-pinned to the Payload version — built on the
official SDK, with streamable HTTP, sessions, per-key capability checkboxes and
generic CRUD tools derived from the field configs. Against that, this package
used to carry a 146-line JSON-RPC subset that spoke `tools/list` and
`tools/call` and nothing else, mounted six times over, one endpoint per server.

The transport was never the product. The tools are: a publish pipeline with
policy gates, approvals, component contracts, an audit trail. Those stayed ours;
what carries them did not have to be.

This adapter is what made that swap a configuration change rather than a rewrite
of every tool. It is now the only path: the six endpoints and the handler behind
them are deleted, and a host that wants these tools reachable passes a collector
(see `collector.ts`) to each plugin and its array to `mcpPlugin`. A host that
passes none gets the plugins' non-MCP behaviour and no tools.
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
  /**
   * Where a tool's unhandled throw is recorded, as `system.error`.
   *
   * Optional, and absent means the previous behaviour: the throw reaches
   * `plugin-mcp`, becomes a JSON-RPC error, and leaves no trace. Every server
   * in the suite passes one; a host wiring a tool by hand need not.
   */
  audit?: AuditWriter
  /**
   * Which `mcpServer` those rows are attributed to. Derived from the collector's
   * `serverName` by `auditServerFor`, which is not the identity function — see
   * `audit-server.ts`.
   */
  auditServer?: AuditMcpServer
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
      const context = contextFrom(req, options)
      try {
        const result = await tool.handler(args, context)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      } catch (error) {
        await recordToolFailure(tool.name, error, args, context, options)
        throw error
      }
    },
  }
}

/*
The one place a tool's crash becomes a row, and the reason `system.error` had a
name in the taxonomy and no writer.

Audit 12 H3: `'system.error'` was declared in `audit/types.ts`, present in the
Postgres enum, and written by nothing — while `observability.md` opened with
"the audit log is the single most useful debugging tool" and listed errors among
what lands there. A tool that returns `deniedEnvelope` or an `{ error }` result
audits itself; a tool that *throws* did not, so the failures most worth reading
were the only ones absent.

This is the choke point every tool in the suite passes through — all six
servers, every tool — so wrapping here is one wrap rather than one per tool,
and a tool added tomorrow is covered without its author knowing this file
exists. It also covers the tools that audit nothing else: `list_components`,
`get_contract`, `get_variants`, `get_tokens` and the five audit reads write no
row on success, so a crash is the only thing they have ever recorded.

Three properties it has to have, in order:

**The original error still propagates.** `plugin-mcp` turns a throw into a
JSON-RPC error and the client needs that. Recording is a side effect, not a
handler.

**Recording cannot itself fail the call.** `createAuditWriter` already swallows
its own write failures, but `options.audit` is an interface and a caller may
pass something less careful, so the `await` is wrapped too. An audit miss is a
gap in a log; a throw from here would replace the tool's real error with this
file's, which is the one outcome that would make debugging worse rather than
better.

**The message is the error's, and nothing else.** No stack: `errorMessage` is a
`varchar` on a table admins and editors can read through the admin UI, and a
stack names file paths and sometimes argument values. The arguments are not
recorded either — a tool's input can carry a form submission or a draft — but
`_meta` is, because the agent's own prompt and reasoning are what make a crash
row legible, and they are already recorded on every successful write.
*/
async function recordToolFailure(
  toolName: string,
  error: unknown,
  args: Record<string, unknown>,
  context: McpToolContext,
  options: ToPayloadMcpToolOptions,
): Promise<void> {
  const { audit, auditServer } = options
  const logger = context.logger ?? defaultLogger
  const message = error instanceof Error ? error.message : String(error)

  logger.error(`MCP tool "${toolName}" threw`, { tool: toolName, error: message })

  if (!audit || !auditServer) return

  try {
    const meta = McpMetaSchema.safeParse(args['_meta'])
    await audit({
      ...auditContext(context, meta.success ? meta.data : undefined),
      action: 'system.error',
      mcpServer: auditServer,
      mcpTool: toolName,
      summary: `${toolName} threw: ${message}`,
      success: false,
      errorMessage: message,
    })
  } catch (recordError) {
    logger.error('Recording an MCP tool failure failed', {
      tool: toolName,
      error: String(recordError),
    })
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

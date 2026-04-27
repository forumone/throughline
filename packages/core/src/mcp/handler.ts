import type { Payload } from 'payload'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type {
  Logger,
  McpAuthenticator,
  McpToolDefinition,
} from '@forumone/throughline-plugin-contract'
import { createBearerTokenAuthenticator } from '../auth/index.js'
import { defaultLogger } from '../logger/index.js'

export interface McpHandlerOptions {
  payload: Payload
  /** Server identifier surfaced in logs (e.g. `'publishing'`). */
  serverName: string
  /** Tools the server exposes via `tools/list` and `tools/call`. */
  tools: McpToolDefinition[]
  /** Optional override; defaults to a bearer-token authenticator. */
  authenticator?: McpAuthenticator
  /** Optional logger; defaults to the framework's console logger. */
  logger?: Logger
}

/**
 * Returns an HTTP handler that implements the Model Context Protocol's
 * JSON-RPC subset over a single POST endpoint. Handles authentication,
 * tool listing, tool dispatch, and error formatting.
 */
export function createMcpHandler(options: McpHandlerOptions): (request: Request) => Promise<Response> {
  const authenticator =
    options.authenticator ?? createBearerTokenAuthenticator({ payload: options.payload })
  const toolsByName = new Map(options.tools.map((t) => [t.name, t]))
  const logger = options.logger ?? defaultLogger
  const tag = `[${options.serverName}]`

  return async function handleMcp(request: Request): Promise<Response> {
    const auth = await authenticator.authenticate(request)
    if (!auth) return jsonResponse({ error: 'Unauthorized' }, 401)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonRpcError(null, JSON_RPC_PARSE_ERROR, 'Parse error')
    }

    const parsed = JsonRpcRequestSchema.safeParse(body)
    if (!parsed.success) return jsonRpcError(null, JSON_RPC_INVALID_REQUEST, 'Invalid request')

    const rpc = parsed.data
    const id = rpc.id ?? null

    try {
      if (rpc.method === 'tools/list') {
        return jsonRpcResult(id, {
          tools: options.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: zodToJsonSchema(tool.inputSchema, { target: 'jsonSchema7' }),
          })),
        })
      }

      if (rpc.method === 'tools/call') {
        const params = ToolCallParamsSchema.safeParse(rpc.params)
        if (!params.success) {
          return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, 'Invalid params')
        }

        const tool = toolsByName.get(params.data.name)
        if (!tool) {
          return jsonRpcError(id, JSON_RPC_METHOD_NOT_FOUND, `Unknown tool: ${params.data.name}`)
        }

        const inputResult = tool.inputSchema.safeParse(params.data.arguments ?? {})
        if (!inputResult.success) {
          return jsonRpcError(
            id,
            JSON_RPC_INVALID_PARAMS,
            `Invalid arguments: ${inputResult.error.message}`,
          )
        }

        const toolLogger: Logger = {
          debug: (m, c) => logger.debug(`${tag} ${m}`, c),
          info: (m, c) => logger.info(`${tag} ${m}`, c),
          warn: (m, c) => logger.warn(`${tag} ${m}`, c),
          error: (m, c) => logger.error(`${tag} ${m}`, c),
        }

        const result = await tool.handler(inputResult.data, {
          user: auth.user,
          apiKeyName: auth.apiKeyName,
          logger: toolLogger,
        })

        return jsonRpcResult(id, {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result),
            },
          ],
        })
      }

      return jsonRpcError(id, JSON_RPC_METHOD_NOT_FOUND, `Method not found: ${rpc.method}`)
    } catch (error) {
      logger.error(`${tag} MCP handler error`, { error: String(error), method: rpc.method })
      return jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, 'Internal error')
    }
  }
}

const JSON_RPC_PARSE_ERROR = -32700
const JSON_RPC_INVALID_REQUEST = -32600
const JSON_RPC_METHOD_NOT_FOUND = -32601
const JSON_RPC_INVALID_PARAMS = -32602
const JSON_RPC_INTERNAL_ERROR = -32603

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
})

const ToolCallParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function jsonRpcResult(id: string | number | null, result: unknown): Response {
  return jsonResponse({ jsonrpc: '2.0', id, result })
}

function jsonRpcError(id: string | number | null, code: number, message: string): Response {
  return jsonResponse({ jsonrpc: '2.0', id, error: { code, message } })
}

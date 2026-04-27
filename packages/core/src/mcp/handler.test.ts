import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { McpAuthResult, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { Payload } from 'payload'
import { createMcpHandler } from './handler.js'

const stubPayload = {} as Payload

const fakeAuth: McpAuthResult = {
  user: {
    id: 'u1',
    email: 'ci@example.com',
    name: 'CI',
    roles: ['admin'],
    groups: [],
  },
  apiKeyName: 'CI key',
  apiKeyId: 'k1',
}

const okAuthenticator = {
  async authenticate() {
    return fakeAuth
  },
}

const denyAuthenticator = {
  async authenticate() {
    return null
  },
}

function rpcRequest(payload: unknown): Request {
  return new Request('http://example.com/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
}

const greetTool: McpToolDefinition = {
  name: 'greet',
  description: 'Says hello to a name',
  inputSchema: z.object({ name: z.string() }),
  handler: async ({ name }) => ({ greeting: `hi ${name}` }),
}

describe('createMcpHandler', () => {
  it('returns 401 when authentication fails', async () => {
    const handler = createMcpHandler({
      payload: stubPayload,
      serverName: 'test',
      tools: [greetTool],
      authenticator: denyAuthenticator,
    })
    const response = await handler(rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    expect(response.status).toBe(401)
  })

  it('returns a parse error for invalid JSON', async () => {
    const handler = createMcpHandler({
      payload: stubPayload,
      serverName: 'test',
      tools: [greetTool],
      authenticator: okAuthenticator,
    })
    const response = await handler(rpcRequest('not json'))
    const body = (await response.json()) as { error: { code: number } }
    expect(body.error.code).toBe(-32700)
  })

  it('returns the registered tools on tools/list', async () => {
    const handler = createMcpHandler({
      payload: stubPayload,
      serverName: 'test',
      tools: [greetTool],
      authenticator: okAuthenticator,
    })
    const response = await handler(rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    const body = (await response.json()) as { result: { tools: { name: string }[] } }
    expect(body.result.tools.map((t) => t.name)).toEqual(['greet'])
  })

  it('invokes the handler on tools/call and returns its result as text content', async () => {
    const handler = createMcpHandler({
      payload: stubPayload,
      serverName: 'test',
      tools: [greetTool],
      authenticator: okAuthenticator,
    })
    const response = await handler(
      rpcRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'greet', arguments: { name: 'world' } },
      }),
    )
    const body = (await response.json()) as { result: { content: { text: string }[] } }
    expect(body.result.content[0]?.text).toBe('{"greeting":"hi world"}')
  })

  it('returns InvalidParams for arguments that fail the input schema', async () => {
    const handler = createMcpHandler({
      payload: stubPayload,
      serverName: 'test',
      tools: [greetTool],
      authenticator: okAuthenticator,
    })
    const response = await handler(
      rpcRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'greet', arguments: { name: 42 } },
      }),
    )
    const body = (await response.json()) as { error: { code: number } }
    expect(body.error.code).toBe(-32602)
  })

  it('returns MethodNotFound for an unknown tool', async () => {
    const handler = createMcpHandler({
      payload: stubPayload,
      serverName: 'test',
      tools: [greetTool],
      authenticator: okAuthenticator,
    })
    const response = await handler(
      rpcRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'nope', arguments: {} },
      }),
    )
    const body = (await response.json()) as { error: { code: number; message: string } }
    expect(body.error.code).toBe(-32601)
    expect(body.error.message).toContain('Unknown tool')
  })

  it('returns InternalError when a tool handler throws and logs the failure', async () => {
    const error = vi.fn()
    const handler = createMcpHandler({
      payload: stubPayload,
      serverName: 'test',
      tools: [
        {
          ...greetTool,
          handler: async () => {
            throw new Error('boom')
          },
        },
      ],
      authenticator: okAuthenticator,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error },
    })
    const response = await handler(
      rpcRequest({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'greet', arguments: { name: 'x' } },
      }),
    )
    const body = (await response.json()) as { error: { code: number } }
    expect(body.error.code).toBe(-32603)
    expect(error).toHaveBeenCalled()
  })
})

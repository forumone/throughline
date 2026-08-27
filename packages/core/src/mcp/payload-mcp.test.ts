import type { McpToolContext, McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { withMeta } from './meta.js'
import { toPayloadMcpTool, toPayloadMcpTools, type PayloadMcpRequest } from './payload-mcp.js'

/*
The adapter is the whole question the spike asked: can Throughline's tools be
served by Payload's own MCP plugin without being rewritten?

These build a tool exactly as the real ones are built — `withMeta` around a zod
shape, a handler taking `(input, ctx)` — and check the three translations. If a
shape here stops matching what `@payloadcms/plugin-mcp` accepts, that is the
signal to look again rather than to loosen a type.
*/

function publishTool(handler = vi.fn(async () => ({ published: true }))): {
  tool: McpToolDefinition
  handler: typeof handler
} {
  return {
    tool: {
      name: 'publish',
      description: 'Publishes a draft document through the full pipeline.',
      inputSchema: withMeta({ collection: z.string(), id: z.string() }),
      requiredScope: 'publishing.execute',
      handler: handler as unknown as McpToolDefinition['handler'],
    },
    handler,
  }
}

const mcpRequest: PayloadMcpRequest = {
  user: { id: 7, email: 'ada@example.com', name: 'Ada', roles: ['editor'], groups: [] },
  payloadAPI: 'MCP',
}

describe('toPayloadMcpTool', () => {
  it('hands over the raw shape, which is what the plugin registers', () => {
    const { tool } = publishTool()
    const adapted = toPayloadMcpTool(tool)

    // `plugin-mcp` takes a ZodRawShape, `withMeta` produces a ZodObject around
    // one. `.shape` is the entire conversion.
    expect(Object.keys(adapted.parameters).sort()).toEqual(['_meta', 'collection', 'id'])
    expect(adapted.name).toBe('publish')
    expect(adapted.description).toContain('Publishes a draft')
  })

  it('builds a tool context from the request', async () => {
    const { tool, handler } = publishTool()
    await toPayloadMcpTool(tool).handler({ collection: 'pages', id: '1' }, mcpRequest, undefined)

    const context = handler.mock.calls[0]?.[1] as unknown as McpToolContext
    expect(context.user).toEqual({
      id: '7',
      email: 'ada@example.com',
      name: 'Ada',
      roles: ['editor'],
      groups: [],
    })
  })

  it('passes the arguments through untouched', async () => {
    const { tool, handler } = publishTool()
    await toPayloadMcpTool(tool).handler(
      { collection: 'pages', id: '1', _meta: { userPrompt: 'ship it' } },
      mcpRequest,
      undefined,
    )

    expect(handler.mock.calls[0]?.[0]).toEqual({
      collection: 'pages',
      id: '1',
      _meta: { userPrompt: 'ship it' },
    })
  })

  it('wraps the result as MCP content', async () => {
    const { tool } = publishTool(vi.fn(async () => ({ published: true })))
    const result = await toPayloadMcpTool(tool).handler({}, mcpRequest, undefined)

    expect(result.content[0]?.type).toBe('text')
    expect(JSON.parse(String(result.content[0]?.text))).toEqual({ published: true })
  })

  /*
  `plugin-mcp` resolves a key to its linked user and does not carry the key
  document forward, so "which key" is not a question the request can answer. An
  audit row naming the strategy is honest; one asserting a name nothing checked
  is not.
  */
  it('names the strategy when the caller does not supply a key name', async () => {
    const { tool, handler } = publishTool()
    await toPayloadMcpTool(tool).handler({}, mcpRequest, undefined)

    expect((handler.mock.calls[0]?.[1] as unknown as McpToolContext).apiKeyName).toBe('mcp-api-key')
  })

  it('prefers a key name the host supplies', async () => {
    const { tool, handler } = publishTool()
    await toPayloadMcpTool(tool, { apiKeyName: 'Scheduled publishing' }).handler(
      {},
      mcpRequest,
      undefined,
    )

    expect((handler.mock.calls[0]?.[1] as unknown as McpToolContext).apiKeyName).toBe(
      'Scheduled publishing',
    )
  })

  it('carries a request with no user through as the system', async () => {
    const { tool, handler } = publishTool()
    await toPayloadMcpTool(tool).handler({}, { payloadAPI: 'MCP', user: null }, undefined)

    expect((handler.mock.calls[0]?.[1] as unknown as McpToolContext).user).toBeNull()
  })

  /*
  The one shape that cannot be adapted, failing loudly at wiring time rather
  than at the first call.
  */
  it('refuses a tool whose input is not an object schema', () => {
    const tool: McpToolDefinition = {
      name: 'odd',
      description: 'Takes a bare string.',
      inputSchema: z.string(),
      handler: async () => ({}),
    }

    expect(() => toPayloadMcpTool(tool)).toThrow(/not a z.object/)
  })

  it('adapts a whole server in one call', () => {
    const tools = toPayloadMcpTools([publishTool().tool, publishTool().tool])
    expect(tools).toHaveLength(2)
  })
})

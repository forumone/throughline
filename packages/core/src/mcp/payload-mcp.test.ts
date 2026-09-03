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

/*
Audit 12 H3: `'system.error'` was in the taxonomy, in the Postgres enum, and
written by nothing, while `observability.md` listed errors among what the audit
log records. A tool that returns a refusal audits itself; a tool that *throws*
left no row, so the failures most worth reading were the only absent ones.

These are about the three properties the recording has to have — the caller
still sees the real error, a recording failure cannot replace it, and nothing
sensitive rides along.
*/
describe('a tool that throws', () => {
  function throwingTool(error: unknown = new Error('Postgres went away')) {
    return {
      name: 'publish',
      description: 'Publishes a draft document through the full pipeline.',
      inputSchema: withMeta({ collection: z.string(), id: z.string() }),
      handler: (async () => {
        throw error
      }) as unknown as McpToolDefinition['handler'],
    } satisfies McpToolDefinition
  }

  const wiring = () => ({ audit: vi.fn(async () => {}), auditServer: 'publishing' as const })

  it('records one system.error row naming the server and the tool', async () => {
    const { audit, auditServer } = wiring()
    const adapted = toPayloadMcpTool(throwingTool(), { audit, auditServer })

    await expect(adapted.handler({}, mcpRequest, undefined)).rejects.toThrow('Postgres went away')

    expect(audit).toHaveBeenCalledTimes(1)
    expect(audit.mock.calls[0]?.[0]).toMatchObject({
      action: 'system.error',
      mcpServer: 'publishing',
      mcpTool: 'publish',
      success: false,
      errorMessage: 'Postgres went away',
    })
  })

  /*
  The original error, not this file's. `plugin-mcp` turns a throw into the
  JSON-RPC error the client reads, so recording is a side effect and swallowing
  would turn a failure into a silent success.
  */
  it('still throws the original error', async () => {
    const error = new TypeError('cannot read properties of undefined')
    const { audit, auditServer } = wiring()
    const adapted = toPayloadMcpTool(throwingTool(error), { audit, auditServer })

    await expect(adapted.handler({}, mcpRequest, undefined)).rejects.toBe(error)
  })

  it('attributes the row to the caller, the way every successful write is', async () => {
    const { audit, auditServer } = wiring()
    await toPayloadMcpTool(throwingTool(), { audit, auditServer })
      .handler({}, mcpRequest, undefined)
      .catch(() => {})

    expect(audit.mock.calls[0]?.[0].actor).toMatchObject({
      type: 'user',
      userId: '7',
      userName: 'Ada',
      apiKeyName: 'mcp-api-key',
    })
  })

  it('carries `_meta` through, because a crash with no intent is unreadable', async () => {
    const { audit, auditServer } = wiring()
    await toPayloadMcpTool(throwingTool(), { audit, auditServer })
      .handler(
        { collection: 'pages', id: '1', _meta: { userPrompt: 'publish the About page' } },
        mcpRequest,
        undefined,
      )
      .catch(() => {})

    expect(audit.mock.calls[0]?.[0].prompt).toBe('publish the About page')
  })

  /*
  A tool's arguments can carry a form submission, a draft body, or a token
  somebody passed by hand, and `errorMessage` is a column admins and editors
  read through the admin UI. The message is the error's and nothing else — no
  stack, no arguments.
  */
  it('records no arguments and no stack', async () => {
    const { audit, auditServer } = wiring()
    const error = new Error('write failed')
    error.stack = 'Error: write failed\n    at /var/task/apps/web/.next/server/secret.js:1:1'

    await toPayloadMcpTool(throwingTool(error), { audit, auditServer })
      .handler({ collection: 'pages', id: '1', password: 'hunter2' }, mcpRequest, undefined)
      .catch(() => {})

    const row = JSON.stringify(audit.mock.calls[0]?.[0])
    expect(row).not.toContain('hunter2')
    expect(row).not.toContain('/var/task')
    expect(row).not.toContain('at /')
  })

  it('records a thrown non-Error too', async () => {
    const { audit, auditServer } = wiring()
    await toPayloadMcpTool(throwingTool('a bare string'), { audit, auditServer })
      .handler({}, mcpRequest, undefined)
      .catch(() => {})

    expect(audit.mock.calls[0]?.[0].errorMessage).toBe('a bare string')
  })

  /*
  A writer that throws must not replace the tool's error with its own — that is
  the one outcome that would make debugging worse than having no row at all.
  `createAuditWriter` already swallows its own failures, but `audit` is an
  interface and a caller may pass something less careful.
  */
  it('survives an audit writer that throws', async () => {
    const audit = vi.fn(async () => {
      throw new Error('audit table is gone')
    })
    const adapted = toPayloadMcpTool(throwingTool(), { audit, auditServer: 'publishing' })

    await expect(adapted.handler({}, mcpRequest, undefined)).rejects.toThrow('Postgres went away')
  })

  it('writes nothing when the host wired no writer', async () => {
    const adapted = toPayloadMcpTool(throwingTool())
    await expect(adapted.handler({}, mcpRequest, undefined)).rejects.toThrow('Postgres went away')
  })

  it('leaves a successful call unaudited by this path', async () => {
    const { audit, auditServer } = wiring()
    const tool: McpToolDefinition = {
      name: 'publish',
      description: 'Publishes a draft document through the full pipeline.',
      inputSchema: withMeta({}),
      handler: (async () => ({ published: true })) as unknown as McpToolDefinition['handler'],
    }

    await toPayloadMcpTool(tool, { audit, auditServer }).handler({}, mcpRequest, undefined)

    // The tools audit their own successes with their own actions. A wrapper
    // that also logged one would double every row in the log.
    expect(audit).not.toHaveBeenCalled()
  })
})

import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createMcpToolCollector } from './collector.js'
import { withMeta } from './meta.js'

function tool(name: string): McpToolDefinition {
  return {
    name,
    description: `Does ${name}.`,
    inputSchema: withMeta({ id: z.string() }),
    handler: async () => ({ ok: true }),
  }
}

describe('createMcpToolCollector', () => {
  /*
  The property the whole arrangement rests on. `mcpPlugin` is handed this array
  at config time, when it is empty, and reads it inside the handler it builds per
  request — by which point `onInit` has filled it. Hand over a copy and the tools
  go somewhere nobody reads.
  */
  it('fills the same array the host already handed over', () => {
    const collector = createMcpToolCollector()
    const handedToPlugin = collector.tools

    expect(handedToPlugin).toHaveLength(0)
    collector.add([tool('publish'), tool('unpublish')], { serverName: 'publishing' })

    expect(handedToPlugin).toHaveLength(2)
    expect(handedToPlugin.map(t => t.name)).toEqual(['publish', 'unpublish'])
  })

  it('adapts as it collects, so the plugin gets shapes it can register', () => {
    const collector = createMcpToolCollector()
    collector.add([tool('publish')])

    expect(Object.keys(collector.tools[0]?.parameters ?? {}).sort()).toEqual(['_meta', 'id'])
  })

  it('accumulates across servers, in the order they initialise', () => {
    const collector = createMcpToolCollector()
    collector.add([tool('publish')], { serverName: 'publishing' })
    collector.add([tool('request_approval')], { serverName: 'approvals' })

    expect(collector.tools.map(t => t.name)).toEqual(['publish', 'request_approval'])
    expect(collector.servers).toEqual(['publishing', 'approvals'])
  })

  /*
  Six servers each naming their own `publish` was fine while each had its own
  endpoint. One server is one namespace, and an MCP client offered two tools
  under one name gets whichever registered last — silently, and differently
  depending on plugin order.
  */
  it('refuses a duplicate name, and names both sides', () => {
    const collector = createMcpToolCollector()
    collector.add([tool('publish')], { serverName: 'publishing' })

    expect(() => {
      collector.add([tool('publish')], { serverName: 'scheduling' })
    }).toThrow(/publishing.*scheduling|scheduling.*publishing/s)
  })

  it('passes the tool options through to the adapter', async () => {
    const handler = vi.fn(async () => ({ ok: true }))
    const collector = createMcpToolCollector({ apiKeyName: 'Scheduled publishing' })
    collector.add([{ ...tool('publish'), handler: handler as McpToolDefinition['handler'] }])

    await collector.tools[0]?.handler({}, { user: null, payloadAPI: 'MCP' }, undefined)

    expect((handler.mock.calls[0]?.[1] as { apiKeyName: string }).apiKeyName).toBe(
      'Scheduled publishing',
    )
  })

  it('lets a per-server option override the collector default', async () => {
    const handler = vi.fn(async () => ({ ok: true }))
    const collector = createMcpToolCollector({ apiKeyName: 'default' })
    collector.add([{ ...tool('publish'), handler: handler as McpToolDefinition['handler'] }], {
      apiKeyName: 'publishing',
    })

    await collector.tools[0]?.handler({}, { user: null, payloadAPI: 'MCP' }, undefined)

    expect((handler.mock.calls[0]?.[1] as { apiKeyName: string }).apiKeyName).toBe('publishing')
  })
})

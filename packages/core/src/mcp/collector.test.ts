import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createMcpToolCollector, type McpToolDescriptor } from './collector.js'
import { withMeta } from './meta.js'

function descriptor(name: string): McpToolDescriptor {
  return { name, description: `Does ${name}.` }
}

function tool(name: string): McpToolDefinition {
  return {
    name,
    description: `Does ${name}.`,
    inputSchema: withMeta({ id: z.string() }),
    handler: async () => ({ ok: true }),
  }
}

/** A server's whole lifecycle: declare as the config builds, bind at onInit. */
function register(
  collector: ReturnType<typeof createMcpToolCollector>,
  serverName: string,
  names: string[],
) {
  collector.declare(names.map(descriptor), { serverName })
  collector.add(names.map(tool), { serverName })
}

describe('createMcpToolCollector', () => {
  /*
  The property the whole arrangement rests on. `mcpPlugin` is handed this array
  at config time and reads it inside the handler it builds per request — by which
  point `onInit` has filled it. Hand over a copy and the tools go somewhere
  nobody reads.
  */
  it('fills the same array the host already handed over', () => {
    const collector = createMcpToolCollector()
    const handedToPlugin = collector.tools

    expect(handedToPlugin).toHaveLength(0)
    register(collector, 'publishing', ['publish', 'unpublish'])

    expect(handedToPlugin).toHaveLength(2)
    expect(handedToPlugin.map(t => t.name)).toEqual(['publish', 'unpublish'])
  })

  /*
  The reason declaring is separate from binding.

  `plugin-mcp` maps over this array while the config is being built, to generate
  one per-key checkbox per tool, and then gates every call on the checkbox
  matching the tool's name. An array that is empty at that moment produces no
  checkboxes and its `?? false` denies everything — a valid key, a 200, and an
  empty tools/list. Names and descriptions are all it reads then, and neither
  needs `payload`.
  */
  it('carries name and description from the moment of declaration', () => {
    const collector = createMcpToolCollector()
    collector.declare([descriptor('publish')], { serverName: 'publishing' })

    expect(collector.tools).toHaveLength(1)
    expect(collector.tools[0]?.name).toBe('publish')
    expect(collector.tools[0]?.description).toBe('Does publish.')
  })

  it('adapts on binding, so the plugin gets shapes it can register', () => {
    const collector = createMcpToolCollector()
    collector.declare([descriptor('publish')])

    expect(collector.tools[0]?.parameters).toEqual({})

    collector.add([tool('publish')])
    expect(Object.keys(collector.tools[0]?.parameters ?? {}).sort()).toEqual(['_meta', 'id'])
  })

  /*
  Binding must not replace the element. The plugin was handed this array at
  config time; swapping an entry leaves the generated checkbox pointing at an
  object nobody serves.
  */
  it('binds into the declared entry rather than appending a second one', () => {
    const collector = createMcpToolCollector()
    collector.declare([descriptor('publish')], { serverName: 'publishing' })
    const declared = collector.tools[0]

    collector.add([tool('publish')], { serverName: 'publishing' })

    expect(collector.tools).toHaveLength(1)
    expect(collector.tools[0]).toBe(declared)
  })

  it('accumulates across servers, in the order they declare', () => {
    const collector = createMcpToolCollector()
    register(collector, 'publishing', ['publish'])
    register(collector, 'approvals', ['request_approval'])

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
    collector.declare([descriptor('publish')], { serverName: 'publishing' })

    expect(() => {
      collector.declare([descriptor('publish')], { serverName: 'scheduling' })
    }).toThrow(/publishing.*scheduling|scheduling.*publishing/s)
  })

  /*
  A tool built but never declared would be served and ungated: no checkbox
  exists for it, so `plugin-mcp` denies it to every key and says nothing. Loud
  at init beats silent at request time.
  */
  it('refuses a tool that was built but never declared', () => {
    const collector = createMcpToolCollector()
    collector.declare([descriptor('publish')], { serverName: 'publishing' })

    expect(() => {
      collector.add([tool('rollback')], { serverName: 'publishing' })
    }).toThrow(/rollback.*never declared/s)
  })

  /*
  The other direction, and it cannot throw at init — a server declares before it
  knows whether it can build. So the tool is advertised, and calling it says
  exactly what went wrong instead of failing as a missing handler.
  */
  it('reports what was declared and never bound', async () => {
    const collector = createMcpToolCollector()
    collector.declare([descriptor('publish'), descriptor('rollback')], {
      serverName: 'publishing',
    })
    collector.add([tool('publish')], { serverName: 'publishing' })

    expect(collector.unbound).toEqual(['rollback'])

    const rollback = collector.tools.find(t => t.name === 'rollback')
    expect(() => rollback?.handler({}, { user: null }, undefined)).toThrow(/never bound/)
  })

  it('has nothing unbound once every server has initialised', () => {
    const collector = createMcpToolCollector()
    register(collector, 'publishing', ['publish', 'rollback'])
    register(collector, 'approvals', ['request_approval'])

    expect(collector.unbound).toEqual([])
  })

  it('passes the tool options through to the adapter', async () => {
    const handler = vi.fn(async () => ({ ok: true }))
    const collector = createMcpToolCollector({ apiKeyName: 'Scheduled publishing' })
    collector.declare([descriptor('publish')])
    collector.add([{ ...tool('publish'), handler: handler as McpToolDefinition['handler'] }])

    await collector.tools[0]?.handler({}, { user: null, payloadAPI: 'MCP' }, undefined)

    expect((handler.mock.calls[0]?.[1] as { apiKeyName: string }).apiKeyName).toBe(
      'Scheduled publishing',
    )
  })

  it('lets a per-server option override the collector default', async () => {
    const handler = vi.fn(async () => ({ ok: true }))
    const collector = createMcpToolCollector({ apiKeyName: 'default' })
    collector.declare([descriptor('publish')])
    collector.add([{ ...tool('publish'), handler: handler as McpToolDefinition['handler'] }], {
      apiKeyName: 'publishing',
    })

    await collector.tools[0]?.handler({}, { user: null, payloadAPI: 'MCP' }, undefined)

    expect((handler.mock.calls[0]?.[1] as { apiKeyName: string }).apiKeyName).toBe('publishing')
  })
})

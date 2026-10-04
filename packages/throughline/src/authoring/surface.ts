import type { Config, Plugin } from 'payload'
import { findAuditWriter } from '../audit/plugin.js'
import type { McpToolCollector } from '../mcp/collector.js'
import { deniedEnvelope } from '../mcp/envelope.js'
import type { McpToolContext, McpToolDefinition } from '../plugin-contract/index.js'
import { AUTHORING_TOOL_DESCRIPTORS, OPS_TOOL_NAMES } from './descriptors.js'
import { createAuthoringTools, type AuthoringDeps } from './tools.js'

/*
What `/api/mcp` serves. forumone-2026#830.

Every module still builds its tools, into `inner`, a collector `plugin-mcp`
never sees. This plugin, which runs after all of them, puts two things on the
collector it does see:

- the eight authoring tools, which call the module tools' handlers;
- the operations tools named in `OPS_TOOL_NAMES`, re-exposed as they are but
  refused to anyone who is not an admin.

`plugin-mcp` registers only the tools ticked on the calling key, so an
author's key that has the eight ticked is offered eight. The site decides the
defaults.
*/

export interface SurfaceOptions extends Omit<AuthoringDeps, 'inner' | 'payload'> {
  /** Where the module tools were built. */
  inner: McpToolCollector
  /** What `plugin-mcp` serves. */
  served: McpToolCollector
  /** Re-expose the operations tools, for admins. Default true. */
  ops?: boolean
}

export function isAdmin(ctx: McpToolContext): boolean {
  return Boolean(ctx.user?.roles.includes('admin'))
}

/** A module tool, refused to anyone who is not an admin. */
export function adminOnly(tool: McpToolDefinition): McpToolDefinition {
  return {
    ...tool,
    handler: (input, ctx) =>
      isAdmin(ctx)
        ? tool.handler(input, ctx)
        : Promise.resolve(deniedEnvelope(`${tool.name} is an administrator's tool.`)),
  }
}

export function surfacePlugin(options: SurfaceOptions): Plugin {
  return (incoming: Config): Config => {
    options.served.declare(AUTHORING_TOOL_DESCRIPTORS, { serverName: 'authoring' })

    /*
    Grouped by the module that declared each, so a `system.error` row still
    names the module that threw. Only those that exist: a module that is off
    declared nothing.
    */
    const ops = new Map<string, string[]>()
    if (options.ops !== false) {
      for (const tool of options.inner.declared) {
        if (!OPS_TOOL_NAMES.includes(tool.name)) continue
        ops.set(tool.serverName, [...(ops.get(tool.serverName) ?? []), tool.name])
        options.served.declare(
          [{ name: tool.name, description: `${tool.description} Admin only.` }],
          { serverName: tool.serverName },
        )
      }
    }

    return {
      ...incoming,
      onInit: async (payload) => {
        if (incoming.onInit) await incoming.onInit(payload)
        const audit = findAuditWriter(payload)
        const withAudit = audit ? { audit } : {}
        const { inner, served, ops: _ops, ...deps } = options

        served.add(createAuthoringTools({ ...deps, inner, payload }), {
          serverName: 'authoring',
          ...withAudit,
        })
        for (const [serverName, names] of ops) {
          served.add(
            names.map((name) => {
              const tool = inner.definition(name)
              if (!tool) throw new Error(`${serverName} declared "${name}" and never built it.`)
              return adminOnly(tool)
            }),
            { serverName, ...withAudit },
          )
        }
      },
    }
  }
}

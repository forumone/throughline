import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { type AuditWriter, auditContext, withMeta } from '@forumone/throughline-core'
import type { ManifestLoader } from '../manifest-source.js'
import { findAntiPatterns } from '../validation/composition.js'
import { COMPONENTS_TOOLS } from './descriptors.js'

export interface FindAntiPatternDeps {
  loader: ManifestLoader
  auditWriter: AuditWriter
}

export function createFindAntiPatternTool(deps: FindAntiPatternDeps): McpToolDefinition {
  const inputSchema = withMeta({
    blocks: z
      .array(
        z.object({
          type: z.string(),
          variant: z.string().optional(),
        }),
      )
      .min(1),
  })

  return {
    ...COMPONENTS_TOOLS.findAntiPattern,
    inputSchema,
    handler: async (input, ctx) => {
      const manifest = await deps.loader.get()
      const matches = findAntiPatterns({ blocks: input.blocks }, manifest)

      await deps.auditWriter({
        ...auditContext(ctx, input._meta),
        action: 'design.find_anti_pattern',
        mcpServer: 'component',
        mcpTool: 'find_anti_pattern',
      })

      return { matches }
    },
  }
}

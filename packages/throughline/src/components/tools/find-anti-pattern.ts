import { z } from 'zod'
import type { McpToolDefinition } from '../../plugin-contract/mcp.js'
import { type AuditWriter } from '../../audit/writer.js'
import { auditContext } from '../../mcp/audit-context.js'
import { withMeta } from '../../mcp/meta.js'
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

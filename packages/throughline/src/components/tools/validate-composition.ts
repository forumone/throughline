import { z } from 'zod'
import type { McpToolDefinition } from '../../plugin-contract/mcp.js'
import { type AuditWriter } from '../../audit/writer.js'
import { auditContext } from '../../mcp/audit-context.js'
import { withMeta } from '../../mcp/meta.js'
import type { ManifestLoader } from '../manifest-source.js'
import { validateComposition } from '../validation/composition.js'
import { COMPONENTS_TOOLS } from './descriptors.js'

export interface ValidateCompositionDeps {
  loader: ManifestLoader
  auditWriter: AuditWriter
  /** A block type that is a composed section (forumone-2026#801), not a component. */
  composedBlockType?: string
}

export function createValidateCompositionTool(deps: ValidateCompositionDeps): McpToolDefinition {
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
    ...COMPONENTS_TOOLS.validateComposition,
    inputSchema,
    handler: async (input, ctx) => {
      const manifest = await deps.loader.get()
      const blocks = input.blocks.map((block: { type: string; variant?: string | undefined }) =>
        block.type === deps.composedBlockType ? { type: block.type, composed: true } : block,
      )
      // Contract names, not display labels: the caller named the blocks by
      // their types, and a message naming them differently is a second
      // vocabulary to map back.
      const result = validateComposition({ blocks, label: (type) => type }, manifest)

      await deps.auditWriter({
        ...auditContext(ctx, input._meta),
        action: 'design.validate',
        mcpServer: 'component',
        mcpTool: 'validate_composition',
      })

      return result
    },
  }
}

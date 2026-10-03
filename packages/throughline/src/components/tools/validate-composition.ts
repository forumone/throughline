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
      const result = validateComposition({ blocks: input.blocks }, manifest)

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

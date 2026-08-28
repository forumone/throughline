import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { type AuditWriter, auditContext, withMeta } from '@forumone/throughline-core'
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

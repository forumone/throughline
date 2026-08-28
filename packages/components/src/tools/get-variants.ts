import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { ManifestLoader } from '../manifest-source.js'
import { COMPONENTS_TOOLS } from './descriptors.js'

export function createGetVariantsTool(loader: ManifestLoader): McpToolDefinition {
  return {
    ...COMPONENTS_TOOLS.getVariants,
    inputSchema: z.object({
      name: z.string().describe('The PascalCase name of the component'),
    }),
    handler: async (input) => {
      const manifest = await loader.get()
      const contract = manifest.getComponent(input.name)
      if (!contract) {
        return { error: `Component "${input.name}" not found` }
      }
      return { variants: contract.content.variants ?? [] }
    },
  }
}

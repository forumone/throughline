import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { ManifestLoader } from '../manifest-source.js'

export function createGetContractTool(loader: ManifestLoader): McpToolDefinition {
  return {
    name: 'get_contract',
    description:
      'Returns the full contract for a named component, including intent, composition rules, content fields, variants, tokens, accessibility requirements, examples, and anti-examples.',
    inputSchema: z.object({
      name: z.string().describe('The PascalCase name of the component'),
    }),
    handler: async (input) => {
      const manifest = await loader.get()
      const contract = manifest.getComponent(input.name)
      if (!contract) {
        return { error: `Component "${input.name}" not found in the design system` }
      }
      return contract
    },
  }
}

import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { ManifestLoader } from '../manifest-source.js'

export function createGetTokensTool(loader: ManifestLoader): McpToolDefinition {
  return {
    name: 'get_tokens',
    description:
      'Returns the design tokens a component consumes plus the configurable token-backed props and their allowed values.',
    inputSchema: z.object({
      name: z.string().describe('The PascalCase name of the component'),
    }),
    handler: async (input) => {
      const manifest = await loader.get()
      const contract = manifest.getComponent(input.name)
      if (!contract) {
        return { error: `Component "${input.name}" not found` }
      }
      return contract.tokens
    },
  }
}

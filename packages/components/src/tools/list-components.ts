import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { ManifestLoader } from '../manifest-source.js'
import { COMPONENTS_TOOLS } from './descriptors.js'

export function createListComponentsTool(loader: ManifestLoader): McpToolDefinition {
  return {
    ...COMPONENTS_TOOLS.listComponents,
    inputSchema: z.object({
      category: z
        .string()
        .optional()
        .describe('Optional: filter to a single category (hero, section, card, media, cta, navigation, data, form, utility)'),
    }),
    handler: async (input) => {
      const manifest = await loader.get()
      const components = input.category
        ? manifest.listByCategory(input.category)
        : Object.values(manifest.raw.components)
      return components.map((c) => ({
        name: c.name,
        category: c.category,
        description: c.description,
      }))
    },
  }
}

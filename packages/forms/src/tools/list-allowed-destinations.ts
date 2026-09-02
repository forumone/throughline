import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { listDestinations } from '../destinations.js'
import type { FormsPluginOptions } from '../options.js'
import { FORMS_TOOLS } from './descriptors.js'

const inputSchema = z.object({}).strict()

export interface ListAllowedDestinationsDeps {
  options: FormsPluginOptions
}

export function createListAllowedDestinationsTool(
  deps: ListAllowedDestinationsDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    ...FORMS_TOOLS.listAllowedDestinations,
    inputSchema,
    handler: async () => {
      return { destinations: listDestinations(deps.options) }
    },
  }
}

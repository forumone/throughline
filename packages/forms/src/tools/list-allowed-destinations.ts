import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { listDestinations } from '../destinations.js'
import type { FormsPluginOptions } from '../options.js'

const inputSchema = z.object({}).strict()

export interface ListAllowedDestinationsDeps {
  options: FormsPluginOptions
}

export function createListAllowedDestinationsTool(
  deps: ListAllowedDestinationsDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'list_allowed_destinations',
    description:
      'Returns the labels of destinations forms can route submissions to in this deployment. Use this before create_form / update_form_destinations to discover what is allowed. Adding a new destination requires editing the plugin config and redeploying — that friction is the security model.',
    inputSchema,
    handler: async () => {
      return { destinations: listDestinations(deps.options) }
    },
  }
}

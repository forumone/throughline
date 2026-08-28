import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { IntegrationRegistry } from '../registry.js'
import { INTEGRATIONS_TOOLS } from './descriptors.js'

export interface ListIntegrationTypesDeps {
  registry: IntegrationRegistry
}

const inputSchema = z.object({}).strict()

export function createListIntegrationTypesTool(
  deps: ListIntegrationTypesDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    ...INTEGRATIONS_TOOLS.listIntegrationTypes,
    inputSchema,
    handler: async () => {
      return {
        types: deps.registry.list().map((integration) => ({
          id: integration.id,
          name: integration.name,
          description: integration.description,
          category: integration.category,
          subscribesTo: integration.subscribes.map((s) => s.event),
          hasHealthcheck: typeof integration.healthcheck === 'function',
        })),
      }
    },
  }
}

import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { IntegrationRegistry } from '../registry.js'

export interface ListIntegrationTypesDeps {
  registry: IntegrationRegistry
}

const inputSchema = z.object({}).strict()

export function createListIntegrationTypesTool(
  deps: ListIntegrationTypesDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'list_integration_types',
    description:
      'Lists the integration plugins available in this deployment. Use when answering "what kinds of integrations are supported here?" or before suggesting that someone add a new instance.',
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

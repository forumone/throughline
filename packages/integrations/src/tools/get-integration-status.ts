import { z } from 'zod'
import type { Payload } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { deniedEnvelope, isIntegrationsReader } from './access.js'

export interface GetIntegrationStatusDeps {
  payload: Payload
  collectionSlug: string
}

const inputSchema = z.object({
  integrationId: z
    .string()
    .describe('The ID of the integration instance (the row id from list_integrations).'),
})

export function createGetIntegrationStatusTool(
  deps: GetIntegrationStatusDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'get_integration_status',
    description:
      'Detailed status for a single integration instance — including its last sync time, last error, and current configuration metadata (config values themselves are admin-only and not returned).',
    inputSchema,
    handler: async (input, ctx) => {
      if (!isIntegrationsReader(ctx)) {
        return deniedEnvelope('Only admins and editors can view integration status.')
      }

      let doc: Record<string, unknown> | null = null
      try {
        doc = (await deps.payload.findByID({
          collection: deps.collectionSlug,
          id: input.integrationId,
        })) as Record<string, unknown> | null
      } catch {
        doc = null
      }

      if (!doc) return { error: `No integration instance with id "${input.integrationId}".` }

      return {
        id: String(doc['id']),
        name: String(doc['name']),
        type: String(doc['integrationType']),
        enabled: doc['enabled'] === true,
        lastSyncAt: typeof doc['lastSyncAt'] === 'string' ? doc['lastSyncAt'] : null,
        lastSyncStatus: typeof doc['lastSyncStatus'] === 'string' ? doc['lastSyncStatus'] : 'never-run',
        lastError: typeof doc['lastError'] === 'string' ? doc['lastError'] : null,
      }
    },
  }
}

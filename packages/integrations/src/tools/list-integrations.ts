import { z } from 'zod'
import type { Payload, Where } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { deniedEnvelope, isIntegrationsReader } from './access.js'

export interface ListIntegrationsDeps {
  payload: Payload
  collectionSlug: string
}

const inputSchema = z.object({
  integrationType: z
    .string()
    .optional()
    .describe('Filter to a specific integration type (e.g. "webhook").'),
  onlyEnabled: z
    .boolean()
    .optional()
    .describe('If true, exclude disabled instances. Default: false.'),
})

export function createListIntegrationsTool(
  deps: ListIntegrationsDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'list_integrations',
    description:
      'Lists configured integration instances and their last-sync status. Use to answer "what connections are set up?" or "is the webhook to Slack still working?". Read-only.',
    inputSchema,
    handler: async (input, ctx) => {
      if (!isIntegrationsReader(ctx)) {
        return deniedEnvelope('Only admins and editors can list integrations.')
      }

      const conditions: Where[] = []
      if (input.integrationType) conditions.push({ integrationType: { equals: input.integrationType } })
      if (input.onlyEnabled) conditions.push({ enabled: { equals: true } })

      const result = await deps.payload.find({
        collection: deps.collectionSlug,
        ...(conditions.length > 0 ? { where: { and: conditions } } : {}),
        sort: 'name',
        limit: 100,
      })

      const docs = result.docs as Array<Record<string, unknown>>
      return {
        total: result.totalDocs,
        integrations: docs.map((doc) => ({
          id: String(doc['id']),
          name: String(doc['name']),
          type: String(doc['integrationType']),
          enabled: doc['enabled'] === true,
          lastSyncAt: typeof doc['lastSyncAt'] === 'string' ? doc['lastSyncAt'] : null,
          lastSyncStatus: typeof doc['lastSyncStatus'] === 'string' ? doc['lastSyncStatus'] : 'never-run',
          lastError: typeof doc['lastError'] === 'string' ? doc['lastError'] : undefined,
        })),
      }
    },
  }
}

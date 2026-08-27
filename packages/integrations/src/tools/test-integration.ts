import { z } from 'zod'
import type { Payload } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { IntegrationRegistry } from '../registry.js'
import { deniedEnvelope, isIntegrationsReader } from './access.js'

export interface TestIntegrationDeps {
  payload: Payload
  collectionSlug: string
  registry: IntegrationRegistry
}

const inputSchema = z.object({
  integrationId: z.string().describe('The instance ID to test.'),
})

export function createTestIntegrationTool(
  deps: TestIntegrationDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'test_integration',
    requiredScope: 'integrations.trigger',
    description:
      "Calls the integration's healthcheck. Use to answer 'is the integration reachable / configured correctly?'. Doesn't fire any system events; the test is local to the integration's healthcheck.",
    inputSchema,
    handler: async (input, ctx) => {
      if (!isIntegrationsReader(ctx)) {
        return deniedEnvelope('Only admins and editors can test integrations.')
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

      const integrationType = String(doc['integrationType'])
      const integration = deps.registry.get(integrationType)
      if (!integration) {
        return { error: `Unknown integration type "${integrationType}".` }
      }

      if (!integration.healthcheck) {
        return {
          ok: null,
          message: `${integration.name} does not implement a healthcheck.`,
        }
      }

      const config = (doc['config'] ?? {}) as Record<string, unknown>
      const result = await integration.healthcheck(config)

      return {
        instanceId: input.integrationId,
        instanceName: String(doc['name']),
        type: integrationType,
        healthy: result.ok,
        details: result.details ?? null,
      }
    },
  }
}

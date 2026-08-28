import { z } from 'zod'
import type { Inngest } from 'inngest'
import type { Payload } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { deniedEnvelope, isIntegrationsAdmin } from './access.js'
import { INTEGRATIONS_TOOLS } from './descriptors.js'

export interface TriggerSyncDeps {
  payload: Payload
  collectionSlug: string
  inngest: Inngest
}

const inputSchema = z.object({
  integrationId: z
    .string()
    .describe('The instance ID to sync. Use list_integrations to find it.'),
  reason: z
    .string()
    .optional()
    .describe('Why the sync was triggered. Recorded for the audit trail.'),
})

export function createTriggerSyncTool(
  deps: TriggerSyncDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    ...INTEGRATIONS_TOOLS.triggerSync,
    requiredScope: 'integrations.trigger',
    inputSchema,
    handler: async (input, ctx) => {
      if (!isIntegrationsAdmin(ctx)) {
        return deniedEnvelope('Only admins can manually trigger integrations.')
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
      if (doc['enabled'] !== true) {
        return {
          error: `Integration "${String(doc['name'])}" is disabled. Enable it in the admin before triggering.`,
        }
      }

      const integrationType = String(doc['integrationType'])

      await deps.inngest.send({
        name: 'integration/manual-sync',
        data: {
          integrationId: integrationType,
          instanceId: input.integrationId,
          triggeredBy: ctx.user?.id ?? null,
          reason: input.reason ?? null,
        },
      })

      return {
        ok: true,
        triggered: {
          instanceId: input.integrationId,
          instanceName: String(doc['name']),
          type: integrationType,
        },
        message: `Triggered manual sync for "${String(doc['name'])}". Check list_integrations or get_integration_status in a few seconds for the result.`,
      }
    },
  }
}

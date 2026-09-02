import { z } from 'zod'
import type { Inngest } from 'inngest'
import type { Payload } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { deniedEnvelope, isIntegrationsAdmin } from './access.js'
import { INTEGRATIONS_TOOLS } from './descriptors.js'
import { requestManualSync } from '../sync/manual-sync.js'

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

      // The rules — instance exists, instance enabled, this event shape — live
      // in `requestManualSync`, which the admin's Sync now button calls too.
      const result = await requestManualSync(deps, {
        instanceId: input.integrationId,
        triggeredBy: ctx.user?.id ?? null,
        reason: input.reason ?? null,
      })

      if (!result.ok) return { error: result.message }

      return {
        ok: true,
        triggered: {
          instanceId: result.instanceId,
          instanceName: result.instanceName,
          type: result.integrationType,
        },
        message: `Triggered manual sync for "${result.instanceName}". Check list_integrations or get_integration_status in a few seconds for the result.`,
      }
    },
  }
}

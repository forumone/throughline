import type { InngestFunction } from 'inngest'
import type { IntegrationContext } from '../../types.js'
import { hmacSha256Hex } from './hmac.js'
import type { WebhookConfig } from './config-fields.js'
import { extractIds } from './payload.js'

export const WEBHOOK_INTEGRATION_ID = 'webhook'

/**
 * Builds the two Inngest functions the webhook integration contributes:
 *
 * - `webhook-deliver` subscribes to the system events configured at the
 *   admin layer. For every enabled instance whose `eventFilter` matches,
 *   it POSTs an HMAC-signed body to the target URL, retries up to five
 *   times on failure, and records audit + status updates.
 * - `webhook-manual-trigger` listens for `integration/manual-sync` events
 *   (fired by the `trigger_sync` MCP tool). It delivers a minimal test
 *   payload to a single instance so admins can verify connectivity from
 *   the conversation surface.
 *
 * Failures are isolated: each delivery is its own `step.run`, so a broken
 * instance retries on its own without affecting the others or the
 * publishing pipeline that fired the originating event.
 */
export function createWebhookFunctions(ctx: IntegrationContext): InngestFunction.Any[] {
  const deliver = ctx.inngest.createFunction(
    {
      id: 'webhook-deliver',
      retries: 5,
      triggers: [
        { event: 'content/page.published' },
        { event: 'content/page.unpublished' },
        { event: 'content/page.rolled_back' },
        { event: 'form/submission.received' },
        { event: 'approval/decided' },
      ],
    },
    async ({ event, step }) => {
      const instances = await step.run('load-webhook-instances', () =>
        ctx.loadInstances<WebhookConfig>(WEBHOOK_INTEGRATION_ID),
      )

      for (const instance of instances) {
        const filter = instance.config.eventFilter
        if (filter && filter.length > 0 && !filter.includes(event.name)) continue

        await step.run(`deliver-${instance.id}`, async () => {
          await deliverEvent({ ctx, instance, eventName: event.name, eventData: event.data })
        })
      }
    },
  )

  const manualTrigger = ctx.inngest.createFunction(
    {
      id: 'webhook-manual-trigger',
      triggers: [{ event: 'integration/manual-sync' }],
    },
    async ({ event, step }) => {
      const data = (event.data ?? {}) as { integrationId?: string; instanceId?: string }
      const targetInstanceId = data.instanceId
      if (!targetInstanceId) return

      const instances = await step.run('load-target', async () => {
        const all = await ctx.loadInstances<WebhookConfig>(WEBHOOK_INTEGRATION_ID)
        return all.filter((i) => i.id === targetInstanceId)
      })

      for (const instance of instances) {
        await step.run(`deliver-test-${instance.id}`, async () => {
          await deliverEvent({
            ctx,
            instance,
            eventName: 'integration/manual-sync',
            eventData: { instanceId: instance.id, message: 'Manual sync triggered' },
            includeFullPayloadOverride: true,
          })
        })
      }
    },
  )

  return [deliver, manualTrigger]
}

interface DeliverArgs {
  ctx: IntegrationContext
  instance: { id: string; name: string; config: WebhookConfig }
  eventName: string
  eventData: unknown
  includeFullPayloadOverride?: boolean
}

async function deliverEvent({
  ctx,
  instance,
  eventName,
  eventData,
  includeFullPayloadOverride,
}: DeliverArgs): Promise<void> {
  const includeFull = includeFullPayloadOverride ?? instance.config.includeFullPayload ?? false
  const body = JSON.stringify({
    event: eventName,
    data: includeFull ? eventData : extractIds(eventData),
    timestamp: Date.now(),
    instanceId: instance.id,
  })
  const signature = await hmacSha256Hex(body, instance.config.signingSecret)
  const timeoutMs = (instance.config.timeoutSeconds ?? 10) * 1000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(instance.config.targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-throughline-event': eventName,
        'x-throughline-signature': `sha256=${signature}`,
        'x-throughline-timestamp': String(Date.now()),
      },
      body,
      signal: controller.signal,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await ctx.updateStatus(instance.id, 'failed', message)
    await ctx.recordAudit({
      integrationId: WEBHOOK_INTEGRATION_ID,
      instanceName: instance.name,
      action: 'integration.failed',
      summary: `Failed to deliver ${eventName} to ${instance.name}: ${message}`,
      errorMessage: message,
    })
    throw error
  } finally {
    clearTimeout(timer)
  }

  const success = response.ok
  await ctx.updateStatus(
    instance.id,
    success ? 'success' : 'failed',
    success ? undefined : `HTTP ${response.status}`,
  )
  await ctx.recordAudit({
    integrationId: WEBHOOK_INTEGRATION_ID,
    instanceName: instance.name,
    action: success ? 'integration.synced' : 'integration.failed',
    summary: success
      ? `Delivered ${eventName} to ${instance.name}`
      : `Failed to deliver ${eventName} to ${instance.name} (HTTP ${response.status})`,
    ...(success ? {} : { errorMessage: `HTTP ${response.status}` }),
  })

  if (!success) {
    throw new Error(`Webhook delivery failed: HTTP ${response.status}`)
  }
}

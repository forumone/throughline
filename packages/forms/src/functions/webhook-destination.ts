import type { Inngest, InngestFunction } from 'inngest'
import type { Payload } from 'payload'
import type { ResolvedFormsConfig } from '../options.js'
import { hashIp } from '../submit/ip.js'
import { readSubmissionRows } from './_shared.js'

export interface WebhookDestinationDeps {
  inngest: Inngest
  payload: Payload
  resolved: ResolvedFormsConfig
  /** Override the function id. Default: `form-webhook-destination`. */
  id?: string
  /** Per-call timeout. Default: 10s. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

/**
 * Subscribes to `form/destination.webhook`. POSTs the submission to the
 * allowlist URL with an HMAC-SHA256 signature in `x-throughline-signature`.
 * Reuses the IP-hash secret as the HMAC key so the receiver can verify
 * with a single shared secret regardless of which form fired the event.
 */
export function createWebhookDestinationFunction(
  deps: WebhookDestinationDeps,
): InngestFunction.Any {
  return deps.inngest.createFunction(
    {
      id: deps.id ?? 'form-webhook-destination',
      retries: 5,
      triggers: [{ event: 'form/destination.webhook' }],
    },
    async ({ event, step, logger }) => {
      const data = (event.data ?? {}) as {
        submissionId?: string
        destinationLabel?: string
      }
      if (!data.submissionId || !data.destinationLabel) return { skipped: true }

      const dest = deps.resolved.options.allowedDestinations.find(
        (d) => d.label === data.destinationLabel && d.type === 'webhook',
      )
      if (!dest) {
        logger.warn('Webhook destination no longer on allowlist', { label: data.destinationLabel })
        return { skipped: true, reason: 'destination-removed' }
      }

      const submission = (await step.run('load-submission', async () =>
        deps.payload.findByID({
          collection: deps.resolved.submissionsCollectionSlug,
          id: data.submissionId!,
        }),
      )) as Record<string, unknown> | null
      if (!submission) return { skipped: true, reason: 'submission-not-found' }

      const fields = readSubmissionRows(submission['submissionData'])
      const formId = unwrapId(submission['form'])
      const body = JSON.stringify({
        event: 'form/submission',
        timestamp: Date.now(),
        formId,
        submissionId: data.submissionId,
        destinationLabel: dest.label,
        fields,
      })
      const signature = await hashIp(body, deps.resolved.ipHashSecret)

      const timeout = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      try {
        const response = await fetch(dest.value, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-throughline-event': 'form/submission',
            'x-throughline-signature': `sha256=${signature}`,
            'x-throughline-timestamp': String(Date.now()),
          },
          body,
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Webhook delivery failed: HTTP ${response.status}`)
        }
        return { ok: true, destinationLabel: dest.label, status: response.status }
      } finally {
        clearTimeout(timer)
      }
    },
  )
}

function unwrapId(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id)
  }
  return null
}

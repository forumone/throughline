import type { Integration } from '../../types.js'
import {
  type WebhookConfig,
  configFields,
  MIN_SIGNING_SECRET_LENGTH,
} from './config-fields.js'
import { createWebhookFunctions, WEBHOOK_INTEGRATION_ID } from './functions.js'
import { healthcheck } from './healthcheck.js'

export const webhookIntegration: Integration<WebhookConfig> = {
  id: WEBHOOK_INTEGRATION_ID,
  name: 'Generic Webhook',
  description:
    'POST system events to an external HTTPS endpoint with HMAC-SHA256 signed payloads. Configurable event filter, retries, and timeout.',
  category: 'webhook',
  configFields,
  async validateConfig(config) {
    if (!config?.targetUrl) return { ok: false, reason: 'targetUrl is required' }
    let url: URL
    try {
      url = new URL(config.targetUrl)
    } catch {
      return { ok: false, reason: 'targetUrl is not a valid URL' }
    }
    if (url.protocol !== 'https:') {
      return { ok: false, reason: 'targetUrl must use https://' }
    }
    if (!config.signingSecret || config.signingSecret.length < MIN_SIGNING_SECRET_LENGTH) {
      return {
        ok: false,
        reason: `signingSecret must be at least ${MIN_SIGNING_SECRET_LENGTH} characters`,
      }
    }
    if (
      config.timeoutSeconds !== undefined &&
      (typeof config.timeoutSeconds !== 'number' || config.timeoutSeconds <= 0)
    ) {
      return { ok: false, reason: 'timeoutSeconds must be a positive number' }
    }
    return { ok: true }
  },
  subscribes: [
    { event: 'content/page.published', purpose: 'Notify external systems when content goes live' },
    { event: 'content/page.unpublished', purpose: 'Notify when content is taken down' },
    { event: 'content/page.rolled_back', purpose: 'Notify when content reverts to a prior version' },
    { event: 'form/submission.received', purpose: 'Forward form submissions to downstream systems' },
    { event: 'approval/decided', purpose: 'Notify external workflow tools of approval outcomes' },
  ],
  createFunctions: createWebhookFunctions,
  healthcheck,
}

export type { WebhookConfig } from './config-fields.js'
export { WEBHOOK_INTEGRATION_ID } from './functions.js'

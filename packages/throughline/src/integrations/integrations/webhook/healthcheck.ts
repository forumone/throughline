import type { IntegrationHealth } from '../../types.js'
import type { WebhookConfig } from './config-fields.js'

const HEALTHCHECK_TIMEOUT_MS = 5000

/**
 * Light reachability check for the webhook target. Sends a HEAD request and
 * accepts any 2xx, plus 405 (Method Not Allowed) since plenty of webhook
 * receivers only allow POST and reject HEAD with 405. That's healthy enough
 * for a "your endpoint is up" probe.
 */
export async function healthcheck(config: WebhookConfig): Promise<IntegrationHealth> {
  try {
    const response = await fetch(config.targetUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS),
    })
    if (response.ok || response.status === 405) {
      return { ok: true, details: `Reachable (HTTP ${response.status})` }
    }
    return { ok: false, details: `Endpoint returned HTTP ${response.status}` }
  } catch (error) {
    return {
      ok: false,
      details: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

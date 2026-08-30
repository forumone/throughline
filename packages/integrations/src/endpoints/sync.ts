import type { Endpoint, PayloadRequest } from 'payload'
import type { Inngest } from 'inngest'
import { requestManualSync, type ManualSyncRefusal } from '../sync/manual-sync.js'

export interface CreateSyncEndpointDeps {
  collectionSlug: string
  inngest: Inngest
}

/** Default recorded on the event when the caller supplies no reason of its own. */
export const ADMIN_TRIGGER_REASON = 'Triggered from the admin.'

/** What each refusal means over HTTP. */
const STATUS: Record<ManualSyncRefusal, number> = {
  'not-found': 404,
  disabled: 409,
  // The instance is fine; the queue is not. 502 rather than 500 says the
  // failure is downstream, which is the difference between "retry" and
  // "something here is broken".
  'send-failed': 502,
}

/**
 * `POST /api/<integrations>/:id/sync` — the admin's path to the same event
 * `trigger_sync` fires.
 *
 * Authenticates off the Payload session cookie, so the person clicking the
 * button needs no API key and the event records them rather than a service
 * principal. The rules are `requestManualSync`'s, not this file's; all that
 * lives here is the admin check and the mapping from a refusal to a status
 * code.
 *
 * Admin-only, matching the MCP tool and the collection's own write access:
 * triggering an integration makes it POST to an external system.
 */
export function createSyncEndpoint(deps: CreateSyncEndpointDeps): Endpoint {
  return {
    path: '/:id/sync',
    method: 'post',
    handler: async (req: PayloadRequest): Promise<Response> => {
      if (!req.user) {
        return json({ error: 'You must be logged in to trigger a sync.' }, 401)
      }

      const roles = (req.user['roles'] as string[] | undefined) ?? []
      if (!roles.includes('admin')) {
        return json({ error: 'Only admins can manually trigger integrations.' }, 403)
      }

      const id = req.routeParams?.['id']
      if (typeof id !== 'string' && typeof id !== 'number') {
        return json({ error: 'Expected an integration instance id in the path.' }, 400)
      }

      // The button sends no body at all, so an absent or unparseable one is
      // not an error — only a body that is present and wrong.
      let reason: string | null = null
      try {
        const raw = (await req.json?.()) as { reason?: unknown } | undefined
        if (raw && typeof raw === 'object' && typeof raw.reason === 'string') {
          reason = raw.reason.trim() || null
        }
      } catch {
        reason = null
      }

      const result = await requestManualSync(
        { payload: req.payload, collectionSlug: deps.collectionSlug, inngest: deps.inngest },
        {
          instanceId: String(id),
          triggeredBy: req.user.id ?? null,
          reason: reason ?? `${ADMIN_TRIGGER_REASON} (${req.user['email'] ?? req.user.id})`,
        },
      )

      if (!result.ok) {
        if (result.code === 'send-failed') {
          req.payload.logger.error(
            `[integrations] could not queue a manual sync for ${String(id)}: ${result.message}`,
          )
        }
        return json({ error: result.message, code: result.code }, STATUS[result.code])
      }

      return json(
        {
          ok: true,
          triggered: {
            instanceId: result.instanceId,
            instanceName: result.instanceName,
            type: result.integrationType,
          },
          // What the caller polls against. The sync has not run yet.
          lastSyncAt: result.lastSyncAt,
          message: `Queued a sync for "${result.instanceName}". The status fields update when the run finishes.`,
        },
        202,
      )
    },
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

import type { Inngest } from 'inngest'
import type { Payload } from 'payload'

/**
 * The event every integration's manual-sync function subscribes to. Fired for
 * *all* integrations, which is why each handler filters the payload down to
 * its own instance rather than trusting the event.
 */
export const MANUAL_SYNC_EVENT = 'integration/manual-sync'

export interface RequestManualSyncDeps {
  payload: Payload
  collectionSlug: string
  inngest: Inngest
}

export interface RequestManualSyncArgs {
  /** Payload id of the instance to sync. */
  instanceId: string
  /** Who asked. Recorded on the event so the run can be traced back to them. */
  triggeredBy?: number | string | null
  /** Why. Carried on the event for the audit trail; not otherwise used. */
  reason?: string | null
}

/**
 * Why a trigger was refused. Callers map these onto whatever their transport
 * uses to say no — an error envelope for MCP, a status code for HTTP.
 */
export type ManualSyncRefusal =
  /** No instance with that id. */
  | 'not-found'
  /** The instance exists but `enabled` is false. */
  | 'disabled'
  /** Inngest would not take the event. */
  | 'send-failed'

export type RequestManualSyncResult =
  | {
      ok: true
      instanceId: string
      instanceName: string
      integrationType: string
      /**
       * The instance's `lastSyncAt` at the moment the event was sent, or null
       * if it has never run. A caller watching for the run to finish compares
       * against this rather than against whatever it last rendered.
       */
      lastSyncAt: string | null
    }
  | { ok: false; code: ManualSyncRefusal; message: string }

/**
 * Sends `integration/manual-sync` for one instance, having checked that the
 * instance exists and is enabled.
 *
 * This is the single definition of what triggering a sync *means*, shared by
 * the `trigger_sync` MCP tool and the admin endpoint behind the Sync now
 * button. It deliberately does not check permissions: MCP and HTTP authenticate
 * differently and each caller applies `admin`-only itself, before calling.
 *
 * It fires an event and returns. The sync runs in Inngest and finishes later —
 * an `ok` result means the run was *requested*, never that it succeeded. The
 * outcome lands on the instance's `lastSyncAt` / `lastSyncStatus` / `lastError`
 * when the run completes.
 */
export async function requestManualSync(
  deps: RequestManualSyncDeps,
  args: RequestManualSyncArgs,
): Promise<RequestManualSyncResult> {
  let doc: Record<string, unknown> | null = null
  try {
    doc = (await deps.payload.findByID({
      collection: deps.collectionSlug,
      id: args.instanceId,
    })) as Record<string, unknown> | null
  } catch {
    doc = null
  }

  if (!doc) {
    return {
      ok: false,
      code: 'not-found',
      message: `No integration instance with id "${args.instanceId}".`,
    }
  }

  const instanceName = String(doc['name'])

  if (doc['enabled'] !== true) {
    return {
      ok: false,
      code: 'disabled',
      message: `Integration "${instanceName}" is disabled. Enable it in the admin before triggering.`,
    }
  }

  const integrationType = String(doc['integrationType'])

  try {
    await deps.inngest.send({
      name: MANUAL_SYNC_EVENT,
      data: {
        integrationId: integrationType,
        instanceId: args.instanceId,
        triggeredBy: args.triggeredBy ?? null,
        reason: args.reason ?? null,
      },
    })
  } catch (error) {
    /*
    A failed send used to escape as an unhandled rejection, which the MCP
    transport turned into a generic tool error and a button would have turned
    into nothing at all — the worst outcome, because a sync that was never
    requested looks exactly like one that has not finished yet.
    */
    return {
      ok: false,
      code: 'send-failed',
      message: `Could not reach Inngest to queue the sync: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }

  // A `date` field comes back as an ISO string over REST and as a Date from
  // the local API, and this function is called from both.
  const rawLastSyncAt = doc['lastSyncAt']
  const lastSyncAt =
    rawLastSyncAt instanceof Date
      ? rawLastSyncAt.toISOString()
      : typeof rawLastSyncAt === 'string'
        ? rawLastSyncAt
        : null

  return {
    ok: true,
    instanceId: args.instanceId,
    instanceName,
    integrationType,
    lastSyncAt,
  }
}

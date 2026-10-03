/**
 * Client-side helpers behind the admin's Sync now button. No JSX here, so the
 * request handling and the message formatting can be unit tested without a
 * form, a document or a browser.
 */

export type SyncStatusValue = 'never-run' | 'success' | 'partial' | 'failed'

export interface TriggerSyncBody {
  ok?: boolean
  triggered?: { instanceId: string; instanceName: string; type: string }
  /** The instance's `lastSyncAt` *before* the run. The baseline to poll against. */
  lastSyncAt?: string | null
  message?: string
  error?: string
  code?: string
}

export interface TriggerSyncArgs {
  serverURL: string
  apiRoute: string
  collectionSlug: string
  id: number | string
  reason?: string
}

export type TriggerSyncResult = { ok: true; body: TriggerSyncBody } | { ok: false; message: string }

/**
 * POSTs to the collection's sync endpoint using the browser's session cookie.
 *
 * Every refusal — not found, disabled, Inngest unreachable — comes back as a
 * non-2xx with a message, so all of them land in `ok: false` and get shown.
 * A button that appears to work when nothing was queued is the failure this
 * exists to avoid.
 */
export async function triggerSync(args: TriggerSyncArgs): Promise<TriggerSyncResult> {
  const url = `${args.serverURL}${args.apiRoute}/${args.collectionSlug}/${args.id}/sync`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args.reason ? { reason: args.reason } : {}),
    })
  } catch {
    return { ok: false, message: 'Could not reach the server to queue the sync.' }
  }

  let body: TriggerSyncBody
  try {
    body = (await response.json()) as TriggerSyncBody
  } catch {
    return { ok: false, message: `The server returned ${response.status}.` }
  }

  if (!response.ok) {
    return { ok: false, message: body.error ?? `The server returned ${response.status}.` }
  }

  return { ok: true, body }
}

export interface SyncStatus {
  lastSyncAt: string | null
  lastSyncStatus: SyncStatusValue | null
  lastError: string | null
}

export interface FetchSyncStatusArgs {
  serverURL: string
  apiRoute: string
  collectionSlug: string
  id: number | string
  signal?: AbortSignal
}

/**
 * Reads the three status fields off the instance. Returns null on any failure,
 * because this is called on a timer and a single missed poll is not something
 * to tell anyone about — the caller keeps waiting.
 */
export async function fetchSyncStatus(args: FetchSyncStatusArgs): Promise<null | SyncStatus> {
  const url = `${args.serverURL}${args.apiRoute}/${args.collectionSlug}/${args.id}?depth=0`

  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...(args.signal ? { signal: args.signal } : {}),
    })
    if (!response.ok) return null
    const doc = (await response.json()) as Record<string, unknown>
    return {
      lastSyncAt: typeof doc['lastSyncAt'] === 'string' ? doc['lastSyncAt'] : null,
      lastSyncStatus: isSyncStatusValue(doc['lastSyncStatus']) ? doc['lastSyncStatus'] : null,
      lastError: typeof doc['lastError'] === 'string' ? doc['lastError'] : null,
    }
  } catch {
    return null
  }
}

function isSyncStatusValue(value: unknown): value is SyncStatusValue {
  return value === 'never-run' || value === 'success' || value === 'partial' || value === 'failed'
}

/**
 * True once the instance has recorded a run that started after the trigger.
 *
 * Compared against the `lastSyncAt` the endpoint returned rather than against
 * whatever the page last rendered: the sidebar can be minutes stale, and a
 * document opened during a cron run would otherwise report that run's result
 * as this one's.
 */
export function syncHasFinished(baseline: null | string, current: null | SyncStatus): boolean {
  if (!current) return false
  if (current.lastSyncAt === null) return false
  return current.lastSyncAt !== baseline
}

export interface SyncOutcome {
  severity: 'error' | 'success' | 'warning'
  title: string
  description?: string
}

/**
 * How a finished run reads. `partial` is deliberately a warning rather than a
 * success: some of what was asked for did not happen, and the whole reason
 * somebody pressed this button is to find out whether their change landed.
 */
export function describeSyncOutcome(status: SyncStatus, instanceName?: string): SyncOutcome {
  const subject = instanceName ? `"${instanceName}"` : 'The integration'
  const description = status.lastError ?? undefined

  switch (status.lastSyncStatus) {
    case 'success':
      return { severity: 'success', title: `${subject} synced.` }
    case 'partial':
      return {
        severity: 'warning',
        title: `${subject} synced, with problems.`,
        ...(description ? { description } : {}),
      }
    case 'failed':
      return {
        severity: 'error',
        title: `${subject} failed to sync.`,
        ...(description ? { description } : {}),
      }
    default:
      // A run finished — `lastSyncAt` moved — without leaving a status. Nothing
      // to celebrate and nothing to blame; say what is known.
      return { severity: 'warning', title: `${subject} ran, but reported no status.` }
  }
}

/** `2026-08-29T14:03:00.000Z` as something an operator reads at a glance. */
export function formatSyncTime(value: null | string): string {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString()
}

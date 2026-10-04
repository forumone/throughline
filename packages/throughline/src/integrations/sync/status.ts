import type { Payload } from 'payload'
import type { IntegrationContext, IntegrationStatusUpdate } from '../types.js'

/*
The line `lastError` leads with. forumone-2026#805.

Editors can read an integration's `Last Error`, and what an integration writes
there is for an administrator: `HubSpot 401 on /marketing/v3/…`. So it opens
with a sentence anybody can read — whether the run failed or half-worked, and
who to tell — and the integration's own detail follows, unchanged, for the
person who can act on it.
*/
export const LAST_ERROR_SUMMARY = {
  failed: 'The last sync failed. The details below are for a site administrator.',
  partial:
    "The last sync finished, but some items weren't updated. The details below are for a site administrator.",
} as const

/** `lastError` for a run: the summary line, a blank line, then the integration's own detail. */
export function lastErrorText(status: 'failed' | 'partial', detail: string): string {
  return `${LAST_ERROR_SUMMARY[status]}\n\n${detail}`
}

/**
 * The integration's own detail from a `lastError`, without the summary line —
 * for a reader that already says the same thing in its own words, as the Sync
 * button's toast title does. A value written before the summary existed comes
 * back as it was.
 */
export function lastErrorDetail(text: string): string {
  for (const summary of Object.values(LAST_ERROR_SUMMARY)) {
    if (text.startsWith(`${summary}\n\n`)) return text.slice(summary.length + 2)
  }
  return text
}

/**
 * The fields one `updateStatus` call writes to an instance.
 *
 * `lastError` is cleared only by a success. A partial or failed run replaces it
 * with its message, after a plain summary line. A JavaScript caller can still
 * reach here with a non-success status and no message, which the types refuse;
 * then `lastError` is left alone rather than blanked, so the admin keeps the
 * last reason it had instead of showing a partial run with no reason at all.
 */
export function statusUpdateData(
  ...[status, error]: IntegrationStatusUpdate
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: status,
  }
  if (status === 'success') data['lastError'] = null
  else if (typeof error === 'string' && error.length > 0) {
    data['lastError'] = lastErrorText(status, lastErrorDetail(error))
  }
  return data
}

/** `IntegrationContext.updateStatus`, writing to `collectionSlug` through `payload`. */
export function createStatusWriter(
  payload: Pick<Payload, 'update'>,
  collectionSlug: string,
): IntegrationContext['updateStatus'] {
  return async (instanceId, ...update) => {
    await payload.update({
      collection: collectionSlug,
      id: instanceId,
      data: statusUpdateData(...update),
    })
  }
}

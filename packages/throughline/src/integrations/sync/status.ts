import type { Payload } from 'payload'
import type { IntegrationContext, IntegrationStatusUpdate } from '../types.js'

/**
 * The fields one `updateStatus` call writes to an instance.
 *
 * `lastError` is cleared only by a success. A partial or failed run replaces it
 * with its message. A JavaScript caller can still reach here with a non-success
 * status and no message, which the types refuse; then `lastError` is left alone
 * rather than blanked, so the admin keeps the last reason it had instead of
 * showing a partial run with no reason at all.
 */
export function statusUpdateData(
  ...[status, error]: IntegrationStatusUpdate
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: status,
  }
  if (status === 'success') data['lastError'] = null
  else if (typeof error === 'string' && error.length > 0) data['lastError'] = error
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

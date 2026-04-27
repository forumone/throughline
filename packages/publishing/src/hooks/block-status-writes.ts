import type { CollectionBeforeChangeHook } from 'payload'

/**
 * The trust boundary. This `beforeChange` hook rejects every update that
 * touches `_status` unless the request explicitly carries the
 * `bypassPublishingServer` context flag (set by the pipeline's `executeStep`).
 *
 * Without this hook, the Payload MCP could let Claude flip a document to
 * `published` directly, sidestepping every check the publishing server
 * exists to enforce. With it, the only sanctioned path is the pipeline.
 */
export function createBlockStatusWritesHook(): CollectionBeforeChangeHook {
  return ({ data, originalDoc, operation, context, req }) => {
    if (operation !== 'update') return data
    if (!hasStatusChange(data)) return data

    // No-op writes (status set to its current value) are harmless.
    if (
      originalDoc &&
      typeof originalDoc === 'object' &&
      (data as Record<string, unknown>)['_status'] ===
        (originalDoc as Record<string, unknown>)['_status']
    ) {
      return data
    }

    if (isBypassed(context) || isBypassed(req?.context)) return data

    throw new Error(
      'Direct writes to `_status` are not allowed. Use the publishing server (publish / unpublish / rollback) so the policy pipeline runs.',
    )
  }
}

function hasStatusChange(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null && '_status' in data
  )
}

function isBypassed(context: unknown): boolean {
  if (!context || typeof context !== 'object') return false
  return (context as Record<string, unknown>)['bypassPublishingServer'] === true
}

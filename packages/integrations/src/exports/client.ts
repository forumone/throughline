/**
 * Client entry point for the admin controls, referenced from Payload's import
 * map as `@forumone/throughline-integrations/client#SyncButton`.
 *
 * Kept separate from the package root so server-only consumers never pull React
 * or `@payloadcms/ui` into their bundle.
 */
export { SyncButton } from '../admin/SyncButton.js'
export type { ThroughlineSyncButtonProps } from '../admin/SyncButton.js'

export {
  describeSyncOutcome,
  fetchSyncStatus,
  formatSyncTime,
  syncHasFinished,
  triggerSync,
} from '../admin/sync-client.js'
export type {
  FetchSyncStatusArgs,
  SyncOutcome,
  SyncStatus,
  SyncStatusValue,
  TriggerSyncArgs,
  TriggerSyncBody,
  TriggerSyncResult,
} from '../admin/sync-client.js'

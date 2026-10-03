/**
 * Client components for the admin, referenced from Payload's import map as
 * `@forumone/throughline/client#PublishButton` and the like.
 *
 * Kept off the package root so a server-only consumer never loads React or
 * `@payloadcms/ui`.
 */

// Fields
export { CharacterCountText, CharacterCountTextarea } from '../fields/CharacterCountField.js'

// Publishing
export { PublishButton } from '../publishing/admin/PublishButton.js'
export type { ThroughlinePublishButtonProps } from '../publishing/admin/PublishButton.js'

export { UnpublishButton } from '../publishing/admin/UnpublishButton.js'
export type { ThroughlineUnpublishButtonProps } from '../publishing/admin/UnpublishButton.js'

export { SchedulePublishField } from '../publishing/admin/SchedulePublishField.js'
export type { ThroughlineSchedulePublishFieldProps } from '../publishing/admin/SchedulePublishField.js'

export { callPublishingEndpoint, describeBlock } from '../publishing/admin/publishing-client.js'
export type {
  CallPublishingEndpointArgs,
  PublishingCallResult,
  PublishingIssue,
  PublishingResponse,
} from '../publishing/admin/publishing-client.js'

// Editorial
export { CommandPalette } from '../editorial/palette/CommandPalette.js'
export type { CommandPaletteProps } from '../editorial/palette/CommandPalette.js'
export { ReportsNav } from '../editorial/palette/ReportsNav.js'

// Integrations
export { SyncButton } from '../integrations/admin/SyncButton.js'
export type { ThroughlineSyncButtonProps } from '../integrations/admin/SyncButton.js'

export {
  describeSyncOutcome,
  fetchSyncStatus,
  formatSyncTime,
  syncHasFinished,
  triggerSync,
} from '../integrations/admin/sync-client.js'
export type {
  FetchSyncStatusArgs,
  SyncOutcome,
  SyncStatus,
  SyncStatusValue,
  TriggerSyncArgs,
  TriggerSyncBody,
  TriggerSyncResult,
} from '../integrations/admin/sync-client.js'

/**
 * Client entry point for the admin controls, referenced from Payload's
 * import map as `@forumone/throughline-publishing/client#PublishButton`.
 *
 * Kept separate from the package root so server-only consumers never pull
 * React or `@payloadcms/ui` into their bundle.
 */
export { PublishButton } from '../admin/PublishButton.js'
export type { ThroughlinePublishButtonProps } from '../admin/PublishButton.js'

export { UnpublishButton } from '../admin/UnpublishButton.js'
export type { ThroughlineUnpublishButtonProps } from '../admin/UnpublishButton.js'

export { SchedulePublishField } from '../admin/SchedulePublishField.js'
export type { ThroughlineSchedulePublishFieldProps } from '../admin/SchedulePublishField.js'

export { callPublishingEndpoint, describeBlock } from '../admin/publishing-client.js'
export type {
  CallPublishingEndpointArgs,
  PublishingCallResult,
  PublishingIssue,
  PublishingResponse,
} from '../admin/publishing-client.js'

export { CommandPalette } from '../editorial/palette/CommandPalette.js'
export type { CommandPaletteProps } from '../editorial/palette/CommandPalette.js'
export { ReportsNav } from '../editorial/palette/ReportsNav.js'

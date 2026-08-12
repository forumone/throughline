export { publishingPlugin } from './plugin.js'

export type {
  AccessibilityCheck,
  AccessibilityIssue,
  ActiveApproval,
  ApprovalResolver,
  PublishableCollection,
  PublishingPluginOptions,
  ResolvedCollection,
} from './options.js'

export type {
  PipelineContext,
  PipelineResult,
  PipelineStep,
  PipelineStepResult,
} from './pipeline/index.js'

/**
 * Server-side publishing API. Use these from host code — a custom endpoint,
 * a scheduled job, a Server Action — to run the full policy pipeline as a
 * given user, with no API key and correct audit attribution.
 */
export {
  getPublishStatus,
  getPublishingService,
  publishDocument,
  unpublishDocument,
} from './service.js'

export type {
  DocumentActionArgs,
  PublishOutcome,
  PublishRequest,
  PublishStatusOutcome,
  PublishingActor,
  PublishingService,
  UnpublishOutcome,
} from './service.js'

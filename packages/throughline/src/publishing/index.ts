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
  scheduleDocument,
  unpublishDocument,
  unscheduleDocument,
} from './service.js'

export type {
  DocumentActionArgs,
  PublishOutcome,
  PublishRequest,
  PublishStatusOutcome,
  PublishingActor,
  PublishingService,
  ScheduleOutcome,
  ScheduleRequest,
  UnpublishOutcome,
  UnscheduleOutcome,
} from './service.js'

/**
 * Whether the update in flight on this document is a draft write — a "Save
 * draft", or a tick of autosave — rather than one that changes what the
 * public sees.
 *
 * `afterChange` cannot work this out for itself. Payload sets
 * `data._status = 'draft'` on any `draft: true` update before the hooks
 * run, and `previousDoc` is the latest *version* rather than the live
 * document, so a draft save of a published page and an unpublish of it look
 * the same from inside the hook. The publishing plugin already records the
 * operation's real `draft` argument in `beforeOperation` for its own trust
 * boundary; this exposes the same answer to host hooks.
 *
 * With autosave on, a host `afterChange` that drops a cache or sends a
 * notification fires every few seconds of typing unless it asks this first.
 */
export { isDraftWrite } from './hooks/draft-writes.js'

/**
 * For a write of data derived from a live document — an audio rendition, a
 * sync timestamp — which may change it without the publish pipeline. Never a
 * status change, a create, or the promotion of a pending draft.
 */
export { DERIVED_WRITE_CONTEXT } from './hooks/block-status-writes.js'

// Built-in accessibility checks, which were `@forumone/throughline-publishing/checks`.
export {
  BUILT_IN_ACCESSIBILITY_CHECKS,
  altTextCheck,
  headingHierarchyCheck,
  linkLabelsCheck,
} from './checks/index.js'

// Revalidation and scheduled publishing, as jobs for either adapter in `/jobs`.
export { revalidateOnPublishJob } from './jobs/revalidate-on-publish.js'
export { executeScheduledPublishesJob } from './jobs/execute-scheduled-publishes.js'
export { publishAtScheduledTimeJob } from './jobs/publish-at-scheduled-time.js'
export { createTagRevalidationHooks } from './jobs/revalidate-tag-hooks.js'
export type {
  CollectionTagHookOptions,
  GlobalTagHookOptions,
  RevalidateTagFn,
  TagRevalidationHooks,
  TagRevalidationOptions,
  TagSelector,
} from './jobs/revalidate-tag-hooks.js'
export type {
  ExecuteScheduledPublishesOptions,
  PublishAtScheduledTimeOptions,
  RevalidateFn,
  RevalidateOnPublishOptions,
  RevalidatePathsInput,
  ScheduledCollectionConfig,
  ScheduledPublishRequest,
  ScheduledPublishResult,
} from '../jobs/workflow-types.js'

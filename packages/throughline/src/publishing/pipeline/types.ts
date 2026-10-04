import type { Inngest } from 'inngest'
import type { Payload, TypedUser } from 'payload'
import type { AuthenticatedUser } from '../../plugin-contract/mcp.js'
import type { MessageDate } from '../messages.js'
import type {
  AccessibilityIssue,
  PublishingPluginOptions,
  ResolvedCollection,
} from '../options.js'

export interface PipelineActor {
  user: AuthenticatedUser | null
  apiKeyName: string
  sessionId?: string | undefined
  /**
   * When set, Payload reads and writes inside the pipeline run as this user
   * with `overrideAccess: false`, so the collection's own access control
   * applies. **Both channels set it**, and anything that does not is running
   * unauthorized writes.
   *
   * This used to end "the MCP path leaves it unset because the API key is its
   * own trust boundary." It is not one. `plugin-mcp` generates a per-key
   * checkbox for every tool and **all 27 default to `true`**
   * (`createApiKeysCollection.js:4-15`); the `requiredScope` each tool
   * declares is read by nothing anywhere in the tree; and the key document
   * itself carries no `roles` field, so every role check denies while
   * Payload's `defaultAccess` — `Boolean(user)` — allows. A key was therefore
   * a bearer credential that could publish, unpublish, roll back or schedule
   * any document in any collection with nothing consulted. Audit 04 F-02.
   *
   * `tools/actor.ts` is what sets it now, and refuses when there is no
   * identity to set it to.
   */
  enforceAccessAs?: TypedUser | undefined
}

export interface PipelineMeta {
  userPrompt?: string | undefined
  reasoning?: string | undefined
  changesSummary?: string | undefined
}

export interface PipelineContext {
  payload: Payload
  inngest: Inngest
  options: PublishingPluginOptions
  collection: ResolvedCollection
  document: Record<string, unknown>
  documentId: string
  actor: PipelineActor
  meta?: PipelineMeta | undefined
}

export type PipelineIssue = AccessibilityIssue & {
  rule?: string
  /**
   * Where `field` is, as the editor sees it: `Block 3 (Image Hero) › Image`.
   * Filled in by the pipeline from the collection's own labels, so a check
   * reports a path and never has to know them. Absent when the path cannot be
   * followed, in which case nothing better than the message itself is known.
   * forumone-2026#805.
   */
  where?: string
}

/**
 * The date a block is about — an embargo's end, an expiry — as written into
 * its `reason`. See `MessageDate` in `../messages.ts`.
 */
export type PipelineDate = MessageDate

export interface PipelineStepResult {
  pass: boolean
  reason?: string
  code?: string
  issues?: PipelineIssue[]
  suggestion?: string
  /** The date in `reason`, so the admin can say it in the editor's own zone. */
  when?: PipelineDate
  /**
   * What a developer needs to fix a block no editor can: a plugin missing, a
   * resolver not wired. Logged by the pipeline, kept in the result for an MCP
   * caller, and never shown in the admin, whose `reason` says to tell a site
   * administrator instead.
   */
  detail?: string
  /**
   * Non-fatal problems. The step did what it was asked to; something
   * adjacent to it did not. Warnings never fail a step.
   */
  warnings?: string[]
}

export type PipelineStep = (context: PipelineContext) => Promise<PipelineStepResult>

export interface PipelineResult {
  success: boolean
  failedAt?: string
  reason?: string
  code?: string
  issues?: PipelineIssue[]
  suggestion?: string
  when?: PipelineDate
  detail?: string
  publishedAt?: string
  /** Non-fatal problems collected across the steps that ran. */
  warnings?: string[]
}

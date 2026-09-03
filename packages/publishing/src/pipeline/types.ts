import type { Inngest } from 'inngest'
import type { Payload, TypedUser } from 'payload'
import type { AuthenticatedUser } from '@forumone/throughline-plugin-contract'
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

export type PipelineIssue = AccessibilityIssue & { rule?: string }

export interface PipelineStepResult {
  pass: boolean
  reason?: string
  code?: string
  issues?: PipelineIssue[]
  suggestion?: string
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
  publishedAt?: string
  /** Non-fatal problems collected across the steps that ran. */
  warnings?: string[]
}

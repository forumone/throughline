import type { Inngest } from 'inngest'
import type { Payload } from 'payload'
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
}

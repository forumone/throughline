import type { Payload } from 'payload'
import type { Logger } from '@forumone/throughline-plugin-contract'
import { defaultLogger } from '../logger/index.js'
import { DEFAULT_JOB_FAILURES_SLUG } from './collection.js'
import { summariseReport, type HealthcheckFailureReport, type JobFailureReport } from './report.js'

export interface JobFailureWriterOptions {
  payload: Payload
  collectionSlug?: string | undefined
  logger?: Logger | undefined
}

/** Records one failure. Never throws, never rejects. */
export type JobFailureWriter = (
  report: JobFailureReport | HealthcheckFailureReport,
) => Promise<void>

/**
 * Returns a writer that turns a failure report into a `job-failures` row.
 *
 * It never throws: it runs inside a failure handler, and a throw there is
 * retried by the job runner — a retry storm about the recorder while the
 * original failure goes unrecorded. A write that fails is logged at `error`
 * **with the failure's own summary and message**, so the one thing this
 * writer exists to keep is never lost silently, only demoted to the log.
 *
 * The stack is not stored. Rows are readable through the admin, and a stack
 * names file paths; the webhook report carries it instead.
 */
export function createJobFailureWriter(options: JobFailureWriterOptions): JobFailureWriter {
  const { payload, collectionSlug = DEFAULT_JOB_FAILURES_SLUG } = options
  const logger = options.logger ?? defaultLogger

  return async function recordJobFailure(report): Promise<void> {
    let data: Record<string, unknown> | undefined
    try {
      data = toRow(report)
      await payload.create({ collection: collectionSlug, data })
    } catch (writeError) {
      try {
        logger.error('Job failure write failed', {
          error: String(writeError),
          collection: collectionSlug,
          summary: (data?.['summary'] as string | undefined) ?? safeSummary(report),
          message: data?.['message'],
        })
      } catch {
        // Nothing left to tell.
      }
    }
  }
}

function toRow(report: JobFailureReport | HealthcheckFailureReport): Record<string, unknown> {
  const base = {
    createdAt: report.at,
    kind: report.kind,
    source: report.functionId,
    summary: summariseReport(report).slice(0, 500),
    ...(report.deployment.environment ? { environment: report.deployment.environment } : {}),
    ...(report.deployment.commit ? { commit: report.deployment.commit } : {}),
  }

  if (report.kind === 'healthcheck') {
    return {
      ...base,
      message: `${report.failed.length} check(s) failed: ${report.failed.map((f) => f.name).join(', ')}`,
      details: report.failed,
    }
  }

  return {
    ...base,
    message: report.message,
    ...(report.name ? { errorName: report.name } : {}),
    ...(report.runId ? { runId: report.runId } : {}),
    ...(report.triggerEvent ? { triggerEvent: report.triggerEvent } : {}),
  }
}

function safeSummary(report: unknown): string {
  try {
    return summariseReport(report)
  } catch {
    return '(unsummarisable failure report)'
  }
}

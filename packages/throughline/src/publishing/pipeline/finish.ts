import type { PipelineContext, PipelineStepResult } from './types.js'
import { fieldConfigFor, withWhere } from './where.js'

/**
 * What every step's result goes through before anyone reads it, so no step has
 * to remember either:
 *
 * - each issue gains `where`, its path in the editor's words;
 * - a `detail` — the setup instruction behind a block no editor can fix — is
 *   logged, because the admin will not show it and the person who can act on
 *   it reads the log. It stays on the result for an MCP caller.
 */
export function finishStep(
  context: PipelineContext,
  name: string,
  result: PipelineStepResult,
): PipelineStepResult {
  if (result.detail) {
    const logger = (context.payload as { logger?: { error?: (message: string) => void } })
      .logger
    logger?.error?.(
      `[publishing] ${name} blocked ${context.collection.slug}/${context.documentId} (${result.code ?? 'no code'}): ${result.detail}`,
    )
  }
  if (!result.issues || result.issues.length === 0) return result
  return {
    ...result,
    issues: withWhere(result.issues, fieldConfigFor(context), context.document),
  }
}

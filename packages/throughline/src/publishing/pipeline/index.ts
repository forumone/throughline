import { existStep } from './steps/exist.js'
import { compositionStep } from './steps/composition.js'
import { accessibilityStep } from './steps/accessibility.js'
import { requiredFieldsStep } from './steps/required-fields.js'
import { linkTargetsStep } from './steps/link-targets.js'
import { placeholderImagesStep } from './steps/placeholder-images.js'
import { embargoStep } from './steps/embargo.js'
import { approvalStep } from './steps/approval.js'
import { executeStep } from './steps/execute.js'
import { finishStep } from './finish.js'
import type { PipelineContext, PipelineResult, PipelineStep } from './types.js'

interface OrderedStep {
  name: string
  step: PipelineStep
}

const PREFLIGHT_STEPS: OrderedStep[] = [
  { name: 'exist', step: existStep },
  { name: 'composition', step: compositionStep },
  { name: 'accessibility', step: accessibilityStep },
  { name: 'required-fields', step: requiredFieldsStep },
  // The last content check, and the first to read other documents.
  { name: 'link-targets', step: linkTargetsStep },
  { name: 'placeholder-images', step: placeholderImagesStep },
  { name: 'embargo', step: embargoStep },
  { name: 'approval', step: approvalStep },
]

const ORDERED_STEPS: OrderedStep[] = [
  ...PREFLIGHT_STEPS,
  { name: 'execute', step: executeStep },
]

/**
 * Walks a list of steps, stopping at the first that does not pass.
 *
 * The failure envelope — `failedAt` plus whichever of `reason`, `code`,
 * `issues` and `suggestion` the step supplied — was written out twice, once per
 * runner, and a field added to one would have been missed by the other. It is
 * written here once.
 *
 * Warnings are collected but not returned in the envelope: what to do with them
 * differs between the two callers, and that difference is the only reason there
 * are still two.
 *
 * A warning can reach a *failure* envelope: `link-targets` warns about a link
 * to a scheduled page and can fail on another link in the same run, and an
 * earlier step's warnings are carried past a later failure. `runPublishPipeline`
 * spreads them onto the failure so neither is dropped silently.
 */
async function runSteps(
  context: PipelineContext,
  steps: OrderedStep[],
): Promise<{ failure?: PipelineResult; warnings: string[] }> {
  const warnings: string[] = []

  for (const { name, step } of steps) {
    const result = finishStep(context, name, await step(context))
    if (result.warnings) warnings.push(...result.warnings)
    if (result.pass) continue

    return {
      failure: {
        success: false,
        failedAt: name,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.code ? { code: result.code } : {}),
        ...(result.issues ? { issues: result.issues } : {}),
        ...(result.suggestion ? { suggestion: result.suggestion } : {}),
        ...(result.when ? { when: result.when } : {}),
        ...(result.detail ? { detail: result.detail } : {}),
      },
      warnings,
    }
  }

  return { warnings }
}

/**
 * Runs the full publish pipeline. Stops at the first failing step and
 * returns its diagnostic; otherwise records success with the publish
 * timestamp the execute step set.
 */
export async function runPublishPipeline(context: PipelineContext): Promise<PipelineResult> {
  const { failure, warnings } = await runSteps(context, ORDERED_STEPS)
  const carried = warnings.length ? { warnings } : {}

  if (failure) return { ...failure, ...carried }

  return { success: true, publishedAt: new Date().toISOString(), ...carried }
}

/**
 * Runs every preflight step (everything but `execute`). Used by
 * `get_publish_status` to answer "would this publish succeed?" without
 * mutating anything.
 *
 * Warnings are deliberately dropped, as they always were: this answers a
 * question about whether a publish would be *blocked*, and a warning does not
 * block. Surfacing them here would be a change to what `get_publish_status`
 * means, not a tidy-up.
 */
export async function runPreflightPipeline(context: PipelineContext): Promise<PipelineResult> {
  const { failure } = await runSteps(context, PREFLIGHT_STEPS)
  return failure ?? { success: true }
}

/**
 * Every preflight block at once, for `get_publish_status`. Empty when the
 * document would publish.
 *
 * `runPreflightPipeline` stops at the first failing step, which is right for
 * publishing and scheduling, where the first refusal is the answer. It is the
 * wrong shape for "what is left to fix?". A draft with a composition problem
 * and a missing required field took one round trip to learn of the first and
 * another to learn of the second. forumone-2026#827.
 *
 * `exist` still stops the report: every later step reads the document, and
 * there is none. After that the steps are independent checks on the same
 * document, so each one runs and each failure is kept, in pipeline order.
 */
export async function runPreflightReport(context: PipelineContext): Promise<PipelineResult[]> {
  const [first, ...rest] = PREFLIGHT_STEPS
  const head = await runSteps(context, [first!])
  if (head.failure) return [head.failure]

  const failures: PipelineResult[] = []
  for (const step of rest) {
    const { failure } = await runSteps(context, [step])
    if (failure) failures.push(failure)
  }
  return failures
}

export type { PipelineContext, PipelineResult, PipelineStep, PipelineStepResult } from './types.js'

import { existStep } from './steps/exist.js'
import { compositionStep } from './steps/composition.js'
import { accessibilityStep } from './steps/accessibility.js'
import { requiredFieldsStep } from './steps/required-fields.js'
import { embargoStep } from './steps/embargo.js'
import { approvalStep } from './steps/approval.js'
import { executeStep } from './steps/execute.js'
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
 * One thing worth knowing before adding a step: a warning cannot currently reach
 * a *failure* envelope. `execute` is the only step that warns, it runs last, and
 * its two failure returns carry none — so `runPublishPipeline` spreading
 * warnings onto a failure is unreachable today. It is kept because the moment a
 * step both warns and fails, or an earlier step learns to warn, dropping them
 * would be silent. That is also why there is no test for it: the pipeline has no
 * way to produce the case.
 */
async function runSteps(
  context: PipelineContext,
  steps: OrderedStep[],
): Promise<{ failure?: PipelineResult; warnings: string[] }> {
  const warnings: string[] = []

  for (const { name, step } of steps) {
    const result = await step(context)
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

export type { PipelineContext, PipelineResult, PipelineStep, PipelineStepResult } from './types.js'

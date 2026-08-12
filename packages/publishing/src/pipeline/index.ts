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
 * Runs the full publish pipeline. Stops at the first failing step and
 * returns its diagnostic; otherwise records success with the publish
 * timestamp the execute step set.
 */
export async function runPublishPipeline(context: PipelineContext): Promise<PipelineResult> {
  const warnings: string[] = []

  for (const { name, step } of ORDERED_STEPS) {
    const result = await step(context)
    if (result.warnings) warnings.push(...result.warnings)

    if (!result.pass) {
      return {
        success: false,
        failedAt: name,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.code ? { code: result.code } : {}),
        ...(result.issues ? { issues: result.issues } : {}),
        ...(result.suggestion ? { suggestion: result.suggestion } : {}),
        ...(warnings.length ? { warnings } : {}),
      }
    }
  }

  return {
    success: true,
    publishedAt: new Date().toISOString(),
    ...(warnings.length ? { warnings } : {}),
  }
}

/**
 * Runs every preflight step (everything but `execute`). Used by
 * `get_publish_status` to answer "would this publish succeed?" without
 * mutating anything.
 */
export async function runPreflightPipeline(
  context: PipelineContext,
): Promise<PipelineResult> {
  for (const { name, step } of PREFLIGHT_STEPS) {
    const result = await step(context)
    if (!result.pass) {
      return {
        success: false,
        failedAt: name,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.code ? { code: result.code } : {}),
        ...(result.issues ? { issues: result.issues } : {}),
        ...(result.suggestion ? { suggestion: result.suggestion } : {}),
      }
    }
  }
  return { success: true }
}

export type { PipelineContext, PipelineResult, PipelineStep, PipelineStepResult } from './types.js'

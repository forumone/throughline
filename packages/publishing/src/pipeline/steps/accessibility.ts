import type { PipelineIssue, PipelineStep } from '../types.js'
import { BUILT_IN_ACCESSIBILITY_CHECKS } from '../../checks/index.js'

/**
 * Runs every built-in accessibility check followed by user-supplied ones.
 * Errors block publish; warnings are surfaced on the result but don't fail
 * the step. (Warning-only behavior is currently unused by the built-in
 * checks but reserved for richer per-client checks.)
 *
 * Built-ins named in `disableAccessibilityChecks` are skipped, so a host
 * whose content shape trips one can replace it rather than wait for a
 * plugin release.
 */
export const accessibilityStep: PipelineStep = async (ctx) => {
  const disabled = new Set(ctx.options.disableAccessibilityChecks ?? [])
  const checks = [
    ...BUILT_IN_ACCESSIBILITY_CHECKS.filter((check) => !disabled.has(check.name)),
    ...(ctx.options.accessibilityChecks ?? []),
  ]

  const allIssues: PipelineIssue[] = []
  for (const check of checks) {
    const issues = await check.run(ctx.document, ctx.collection)
    for (const issue of issues) {
      allIssues.push({ ...issue, rule: check.name })
    }
  }

  const errors = allIssues.filter((i) => i.severity === 'error')
  if (errors.length > 0) {
    return {
      pass: false,
      code: 'accessibility-errors',
      reason: `${errors.length} accessibility issue${errors.length === 1 ? '' : 's'}`,
      issues: errors,
      suggestion:
        'Every image needs alt text. Every link needs a label. Heading levels must not skip. Fix these before publishing.',
    }
  }

  return { pass: true }
}

import type { Manifest } from '@forumone/throughline-design-system/contract'
import type { AccessibilityCheckContext } from '../../options.js'
import { plural } from '../../messages.js'
import type { PipelineIssue, PipelineStep } from '../types.js'
import { BUILT_IN_ACCESSIBILITY_CHECKS } from '../../checks/index.js'
import { COMPONENTS_MANIFEST_SYMBOL } from './composition.js'
import { fieldConfigFor, withWhere } from '../where.js'

/**
 * Runs every built-in accessibility check followed by user-supplied ones.
 * Errors block publish; warnings don't, and reach the publish result's
 * `warnings`, one line each, led by where the problem is. (The built-ins raise
 * none; a site's own checks may.) They used to be dropped here, so a check
 * that warned said nothing to anybody.
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

  const context = await checkContext(ctx.payload)
  const allIssues: PipelineIssue[] = []
  for (const check of checks) {
    const issues = await check.run(ctx.document, ctx.collection, context)
    for (const issue of issues) {
      allIssues.push({ ...issue, rule: check.name })
    }
  }

  const errors = allIssues.filter((i) => i.severity === 'error')
  const warnings = withWhere(
    allIssues.filter((i) => i.severity === 'warning'),
    fieldConfigFor(ctx),
    ctx.document,
  ).map((i) => `${i.where ? `${i.where}: ` : ''}${i.message}`)
  const carried = warnings.length ? { warnings } : {}
  if (errors.length > 0) {
    return {
      ...carried,
      pass: false,
      code: 'accessibility-errors',
      // No suggestion: each issue already says what to do about itself.
      reason: `${plural(errors.length, 'thing')} to fix so everyone can use this page.`,
      issues: errors,
    }
  }

  return { pass: true, ...carried }
}

async function checkContext(payload: object): Promise<AccessibilityCheckContext> {
  const manifest = (payload as Record<symbol, unknown>)[COMPONENTS_MANIFEST_SYMBOL] as
    | (() => Promise<Manifest>)
    | undefined
  if (!manifest) return {}
  return { components: (await manifest()).components }
}

import type { Manifest } from './manifest.js'

export interface LintIssue {
  severity: 'error' | 'warning'
  component: string
  rule: string
  message: string
}

export interface LintOptions {
  /**
   * Source of truth for Storybook story IDs. If provided, lint verifies
   * every example's `storyId` exists in this set. Omit to skip the check
   * (e.g. in environments that do not have Storybook output available).
   */
  availableStoryIds?: Set<string>
  /**
   * Source of truth for token names. If provided, lint verifies every
   * token referenced by a component's `tokens.consumes` exists in this set.
   * Defaults to the manifest's own token table when omitted.
   */
  availableTokens?: Set<string>
}

/**
 * Lints a manifest against the contract's internal consistency rules.
 * Returns an array of issues; an empty array means the manifest is clean.
 *
 * Errors describe unambiguous contract violations (unknown component
 * references, unknown tokens). Warnings surface weaker signals that may
 * still be worth addressing.
 */
export function lintManifest(manifest: Manifest, options: LintOptions = {}): LintIssue[] {
  const issues: LintIssue[] = []
  const componentNames = new Set(Object.keys(manifest.components))
  const tokenNames = options.availableTokens ?? new Set(manifest.tokens.map((t) => t.name))
  const storyIds = options.availableStoryIds

  for (const [name, component] of Object.entries(manifest.components)) {
    for (const sibling of component.composition.requiredSiblings) {
      if (!componentNames.has(sibling)) {
        issues.push({
          severity: 'error',
          component: name,
          rule: 'composition.requiredSiblings',
          message: `References unknown component "${sibling}"`,
        })
      }
    }

    for (const adjacent of component.composition.forbiddenAdjacent) {
      if (!componentNames.has(adjacent)) {
        issues.push({
          severity: 'error',
          component: name,
          rule: 'composition.forbiddenAdjacent',
          message: `References unknown component "${adjacent}"`,
        })
      }
    }

    for (const token of component.tokens.consumes) {
      if (!tokenNames.has(token)) {
        issues.push({
          severity: 'error',
          component: name,
          rule: 'tokens.consumes',
          message: `References unknown token "${token}"`,
        })
      }
    }

    if (storyIds) {
      for (const example of component.examples) {
        if (!storyIds.has(example.storyId)) {
          issues.push({
            severity: 'error',
            component: name,
            rule: 'examples.storyId',
            message: `Example "${example.label}" references unknown story "${example.storyId}"`,
          })
        }
      }
    }

    if (component.antiExamples.length === 0) {
      issues.push({
        severity: 'warning',
        component: name,
        rule: 'antiExamples.empty',
        message: 'Component has no anti-examples; consider adding at least one',
      })
    }

    if (component.intent.length < 50) {
      issues.push({
        severity: 'warning',
        component: name,
        rule: 'intent.brevity',
        message: 'Intent statement is quite short; consider a more specific description',
      })
    }
  }

  return issues
}

/** Formats lint issues as a multi-line string suitable for CI output. */
export function formatLintIssues(issues: LintIssue[]): string {
  if (issues.length === 0) return 'No issues found.'

  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  const lines: string[] = []

  if (errors.length > 0) {
    lines.push(`Errors (${errors.length}):`)
    for (const issue of errors) {
      lines.push(`  [${issue.component}] ${issue.rule}: ${issue.message}`)
    }
  }

  if (warnings.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`Warnings (${warnings.length}):`)
    for (const issue of warnings) {
      lines.push(`  [${issue.component}] ${issue.rule}: ${issue.message}`)
    }
  }

  return lines.join('\n')
}

/**
 * Throws when the manifest has any lint errors. Warnings do not throw.
 * Use in CI to fail the build on contract violations.
 */
export function assertManifestClean(manifest: Manifest, options?: LintOptions): void {
  const issues = lintManifest(manifest, options)
  const errors = issues.filter((i) => i.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Manifest has errors:\n${formatLintIssues(errors)}`)
  }
}

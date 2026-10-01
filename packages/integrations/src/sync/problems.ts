import type { IntegrationStatusUpdate } from '../types.js'

/**
 * The longest {@link problemReport} returns by default. Long enough for a
 * handful of reasons; past that, the count says how many more there were.
 */
export const DEFAULT_PROBLEM_REPORT_LENGTH = 500

export interface ProblemReportOptions {
  /** The longest the report may be, suffix included. Defaults to 500. */
  maxLength?: number
}

/**
 * One line per thing a run left undone, joined into the single string that
 * `lastError` and an audit `errorMessage` can share. `undefined` when the list
 * is empty.
 *
 * A report longer than `maxLength` is cut at the limit and ends with the total,
 * e.g. `… (40 problems in all)`, so a long run still says how much went wrong.
 */
export function problemReport(
  problems: readonly string[],
  options: ProblemReportOptions = {},
): string | undefined {
  if (problems.length === 0) return undefined
  const maxLength = options.maxLength ?? DEFAULT_PROBLEM_REPORT_LENGTH

  const joined = problems.join(' | ')
  if (joined.length <= maxLength) return joined

  const suffix = ` … (${problems.length} problems in all)`
  if (suffix.length >= maxLength) return suffix.trimStart().slice(0, maxLength)
  return `${joined.slice(0, maxLength - suffix.length).trimEnd()}${suffix}`
}

/**
 * The `updateStatus` arguments for a run that may have left some records
 * behind: `success` when `problems` is empty, otherwise `partial` with the
 * capped {@link problemReport}. The status is derived from the list, so the
 * two cannot disagree.
 *
 * ```ts
 * await ctx.updateStatus(instance.id, ...statusFromProblems(problems))
 * ```
 */
export function statusFromProblems(
  problems: readonly string[],
  options: ProblemReportOptions = {},
): IntegrationStatusUpdate {
  const report = problemReport(problems, options)
  return report === undefined ? ['success'] : ['partial', report]
}

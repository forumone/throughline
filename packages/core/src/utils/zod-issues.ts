import type { z } from 'zod'

/**
 * Zod's issues as an indented list, one per line.
 *
 * `componentsPlugin`'s options and a publishable collection's config formatted
 * them identically, because the shape is what makes a config error readable:
 * the path to the field, then what is wrong with it. Both plugins already
 * depend on this package, so sharing costs nothing.
 *
 * `(root)` for an issue with no path — what a schema-level refinement produces,
 * and what an empty `join('.')` would otherwise render as nothing at all.
 *
 * A third copy lives in `design-contract`'s loader and stays there. That
 * package depends on `zod` and nothing else, which is what lets the scaffolder
 * and a standalone design system consume it; trading that for four lines would
 * pull the whole plugin surface behind it.
 */
export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}

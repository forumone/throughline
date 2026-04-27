import type { PipelineIssue, PipelineStep } from '../types.js'

/**
 * Verifies SEO title/description, slug, and any per-collection required
 * fields are populated. SEO requirements are non-negotiable: a published
 * page without title and description hurts share previews, search results,
 * and accessibility cards.
 */
export const requiredFieldsStep: PipelineStep = async (ctx) => {
  const issues: PipelineIssue[] = []
  const seo = ctx.document[ctx.collection.seoField] as Record<string, unknown> | undefined

  if (!nonEmptyString(seo?.['title'])) {
    issues.push({
      field: `${ctx.collection.seoField}.title`,
      message: 'SEO title is required',
      severity: 'error',
    })
  }
  if (!nonEmptyString(seo?.['description'])) {
    issues.push({
      field: `${ctx.collection.seoField}.description`,
      message: 'SEO description is required',
      severity: 'error',
    })
  }

  if (!nonEmptyString(ctx.document[ctx.collection.slugField])) {
    issues.push({
      field: ctx.collection.slugField,
      message: 'Slug is required',
      severity: 'error',
    })
  }

  for (const required of ctx.collection.requiredFields ?? []) {
    const value = getPath(ctx.document, required.path)
    if (value === null || value === undefined || value === '') {
      issues.push({
        field: required.path,
        message: required.message,
        severity: 'error',
      })
    }
  }

  if (issues.length > 0) {
    return {
      pass: false,
      code: 'required-fields-missing',
      reason: `${issues.length} required field${issues.length === 1 ? '' : 's'} missing`,
      issues,
      suggestion: 'Fill in the missing fields and try again.',
    }
  }

  return { pass: true }
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[segment]
    }
    return undefined
  }, obj)
}

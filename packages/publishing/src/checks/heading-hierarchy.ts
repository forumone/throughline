import type { AccessibilityCheck, AccessibilityIssue } from '../options.js'

/**
 * Structural heading-hierarchy check. Without rendering the page we can't
 * fully audit heading levels, but we can flag the most common structural
 * mistake: multiple Hero blocks (each becomes an h1 in the reference DS).
 *
 * Block types are matched case-insensitively against `'hero'` since the
 * `blockType` field is by convention lower-cased in Payload.
 */
export const headingHierarchyCheck: AccessibilityCheck = {
  name: 'heading-hierarchy',
  run(doc, collection) {
    const issues: AccessibilityIssue[] = []
    const layoutValue = doc[collection.layoutField]
    if (!Array.isArray(layoutValue)) return issues

    const heroCount = layoutValue.filter((block) => {
      if (!block || typeof block !== 'object') return false
      const blockType = (block as Record<string, unknown>)['blockType']
      return typeof blockType === 'string' && blockType.toLowerCase() === 'hero'
    }).length

    if (heroCount > 1) {
      issues.push({
        field: collection.layoutField,
        message: `Page has ${heroCount} Hero blocks but should have exactly one (each Hero becomes an h1)`,
        severity: 'error',
      })
    }

    return issues
  },
}

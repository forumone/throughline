import type { AccessibilityCheck, AccessibilityIssue } from '../options.js'

/**
 * Structural heading-hierarchy check. Without rendering the page we can't
 * fully audit heading levels, but we can flag the most common structural
 * mistake: more than one hero, when each hero holds the page's `h1`.
 *
 * A hero is a block whose contract's `category` is `hero` — `ImageHero`,
 * `VideoHero`, `CollageHero` alike. It used to be a block whose type was
 * literally `hero`, which no design system using Throughline has, so the check
 * never fired (forumone-2026#805). A contract's `maxPerPage` catches two of
 * the *same* hero; only this catches two different ones.
 *
 * Without the components plugin there are no contracts to ask, and a block
 * typed `hero` is still counted, as before.
 */
export const headingHierarchyCheck: AccessibilityCheck = {
  name: 'heading-hierarchy',
  run(doc, collection, context) {
    const issues: AccessibilityIssue[] = []
    const layoutValue = doc[collection.layoutField]
    if (!Array.isArray(layoutValue)) return issues

    const components = context?.components
    const isHero = (blockType: string): boolean => {
      const contract = components?.[blockType]
      if (contract) return contract.category?.toLowerCase() === 'hero'
      return blockType.toLowerCase() === 'hero'
    }

    const heroCount = layoutValue.filter((block) => {
      if (!block || typeof block !== 'object') return false
      const blockType = (block as Record<string, unknown>)['blockType']
      return typeof blockType === 'string' && isHero(blockType)
    }).length

    if (heroCount > 1) {
      issues.push({
        field: collection.layoutField,
        message: `This page has ${heroCount} hero blocks. Keep one; the hero holds the page's main heading.`,
        severity: 'error',
      })
    }

    return issues
  },
}

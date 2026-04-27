import type { AccessibilityCheck, AccessibilityIssue } from '../options.js'

/**
 * Walks the document tree for objects with both `url` and `label` fields and
 * flags any where the URL is non-empty but the label is missing or empty.
 * "Click here"-style labels are not flagged (those need a content review,
 * not a link-label check).
 */
export const linkLabelsCheck: AccessibilityCheck = {
  name: 'link-labels',
  run(doc) {
    const issues: AccessibilityIssue[] = []
    walkForLinks(doc, (link, path) => {
      const url = link['url']
      const label = link['label']
      const hasUrl = typeof url === 'string' && url.trim() !== ''
      const hasLabel = typeof label === 'string' && label.trim() !== ''
      if (hasUrl && !hasLabel) {
        issues.push({
          field: path,
          message: `Link at "${path}" has a URL but no label`,
          severity: 'error',
        })
      }
    })
    return issues
  },
}

function walkForLinks(
  value: unknown,
  visit: (link: Record<string, unknown>, path: string) => void,
  path = '',
): void {
  if (!value || typeof value !== 'object') return

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walkForLinks(value[i], visit, `${path}[${i}]`)
    }
    return
  }

  const obj = value as Record<string, unknown>
  if ('url' in obj && 'label' in obj) {
    visit(obj, path || '(root)')
  }

  for (const key of Object.keys(obj)) {
    walkForLinks(obj[key], visit, path ? `${path}.${key}` : key)
  }
}

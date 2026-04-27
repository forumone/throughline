import type { AccessibilityCheck, AccessibilityIssue } from '../options.js'

/**
 * Walks the document tree looking for image-shaped objects (anything with
 * a `url` or `filename` property whose `mimeType`, if present, starts with
 * `image/`). Flags any whose `alt` is missing or empty.
 *
 * Heuristic, not exhaustive — clients with non-standard image shapes
 * register their own check via `accessibilityChecks`.
 */
export const altTextCheck: AccessibilityCheck = {
  name: 'alt-text',
  run(doc) {
    const issues: AccessibilityIssue[] = []
    walkForImages(doc, (image, path) => {
      const alt = image['alt']
      if (typeof alt !== 'string' || alt.trim() === '') {
        issues.push({
          field: path,
          message: `Image at "${path}" is missing alt text`,
          severity: 'error',
        })
      }
    })
    return issues
  },
}

function walkForImages(
  value: unknown,
  visit: (image: Record<string, unknown>, path: string) => void,
  path = '',
): void {
  if (!value || typeof value !== 'object') return

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walkForImages(value[i], visit, `${path}[${i}]`)
    }
    return
  }

  const obj = value as Record<string, unknown>
  if (looksLikeImage(obj)) {
    visit(obj, path || '(root)')
  }

  for (const key of Object.keys(obj)) {
    walkForImages(obj[key], visit, path ? `${path}.${key}` : key)
  }
}

function looksLikeImage(obj: Record<string, unknown>): boolean {
  // Require an explicit image marker: a `filename` (Payload media uploads
  // always have one) or an `image/*` mimeType. A bare `{ url }` is too
  // ambiguous — it's just as likely to be a link, so we leave that to the
  // link-labels check.
  const mime = obj['mimeType']
  if (typeof mime === 'string') return mime.startsWith('image/')
  return typeof obj['filename'] === 'string'
}

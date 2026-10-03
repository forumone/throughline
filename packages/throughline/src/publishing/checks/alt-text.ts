import type { AccessibilityCheck, AccessibilityIssue } from '../options.js'

/**
 * Walks the document tree looking for image-shaped objects (anything with
 * a `url` or `filename` property whose `mimeType`, if present, starts with
 * `image/`). Flags any whose `alt` is missing or empty.
 *
 * Skips an upload's `sizes` map: Payload's generated derivatives carry
 * `filename` and `mimeType` but never `alt`, which lives on the parent
 * document. They are renditions of an image already checked, not images in
 * their own right — walking into them reports one false failure per
 * configured `imageSize`.
 *
 * Heuristic, not exhaustive. A host can add checks via `accessibilityChecks`
 * and switch a built-in off via `disableAccessibilityChecks`.
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
  const isImage = looksLikeImage(obj)
  if (isImage) {
    visit(obj, path || '(root)')
  }

  for (const key of Object.keys(obj)) {
    // An image's own derivatives are not separate images.
    if (isImage && key === 'sizes') continue
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

/**
 * Returns true when the honeypot field is empty (i.e. the submitter is
 * probably a real human; bots fill every input). Designed for use with a
 * visually hidden honeypot input — accessible CSS like
 * `position: absolute; left: -10000px` rather than `display: none` so
 * screen readers still see it but humans don't fill it. `display: none`
 * tells naive crawlers "skip this field"; offscreen positioning does not.
 */
export function checkHoneypot(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value !== 'string') return false
  return value.trim() === ''
}

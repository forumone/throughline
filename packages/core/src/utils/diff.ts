/**
 * Computes a shallow diff between two records. Returns an entry per
 * field whose value changed, with `before` and `after` values.
 *
 * Field equality is determined by JSON-string equality for objects and
 * arrays, and `===` for primitives. That is sufficient for audit-log
 * payloads where structures are JSON-shaped to begin with.
 */
export function shallowDiff<T extends Record<string, unknown>>(
  before: T,
  after: T,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    if (!isEqual(before[key], after[key])) {
      diff[key] = { before: before[key], after: after[key] }
    }
  }
  return diff
}

function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a !== typeof b) return false
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

/**
 * When a webhook instance is configured with `includeFullPayload=false`,
 * we still want to include enough context to make the event useful: IDs,
 * slugs, and any other field whose name ends in `Id`. Keeps payloads small
 * without requiring the receiver to make a follow-up API call for the
 * common case.
 */
export function extractIds(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || key === 'slug' || key.endsWith('Id')) {
      result[key] = value
    }
  }
  return result
}

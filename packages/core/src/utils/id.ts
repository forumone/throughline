/**
 * Generates a short, URL-safe, hex-encoded random ID. Optionally prefixed
 * with a token category (e.g. `evt_a1b2c3...`).
 */
export function generateId(prefix?: string): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const id = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return prefix ? `${prefix}_${id}` : id
}

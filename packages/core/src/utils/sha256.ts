/**
 * Hashes a string with SHA-256 using the Web Crypto API; returns lowercase hex.
 *
 * Lived in `auth/api-keys.ts` while this package minted and stored its own MCP
 * keys. Those are gone — `@payloadcms/plugin-mcp` owns key storage now — and
 * `documentContentHash` is the remaining caller, so the function moved to sit
 * beside it rather than being deleted with the collection it was written for.
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

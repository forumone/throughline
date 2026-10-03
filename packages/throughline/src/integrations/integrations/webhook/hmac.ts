/**
 * HMAC-SHA256 utility used by the webhook integration to sign delivery
 * payloads. The hex-encoded digest is sent in the `x-throughline-signature`
 * header (prefixed with `sha256=`); receivers verify by recomputing with
 * the shared secret.
 *
 * Uses Web Crypto so the same code runs in Node 20+, edge runtimes, and
 * the browser (for tests). No Node-specific imports.
 */

const HEX_CHARS = '0123456789abcdef'

export async function hmacSha256Hex(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return bytesToHex(new Uint8Array(signature))
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i]!
    out += HEX_CHARS[byte >> 4]! + HEX_CHARS[byte & 0xf]!
  }
  return out
}

/**
 * Hashes a submitter IP with HMAC-SHA256 and the deployment's secret. The
 * raw IP is never persisted; the hash is what rate-limit and audit need.
 * Using a per-deployment secret means two deployments produce different
 * hashes for the same IP — an attacker who exfiltrated the hash table from
 * one site cannot pivot to another.
 *
 * Implemented via Web Crypto so the same code runs in Node 20+, edge
 * runtimes, and browser test environments.
 */
export async function hashIp(ip: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(ip))
  return bytesToHex(new Uint8Array(sig))
}

const HEX_CHARS = '0123456789abcdef'

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i]!
    out += HEX_CHARS[byte >> 4]! + HEX_CHARS[byte & 0xf]!
  }
  return out
}

/**
 * Best-effort client-IP extraction. Honors the standard proxy headers
 * Vercel/Cloudflare/most reverse proxies set; falls back to '0.0.0.0' so
 * upstream code can still hash without branching. Two requests with no
 * headers will share a hash and rate-limit bucket — that is the intended
 * "no-IP" fail-safe.
 */
export function extractClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]
    if (first) return first.trim()
  }
  const real = headers.get('x-real-ip')
  if (real) return real
  const cf = headers.get('cf-connecting-ip')
  if (cf) return cf
  return '0.0.0.0'
}

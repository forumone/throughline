import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/*
Every secret this module hands out, and how each is kept.

**Tokens are opaque and stored hashed.** An access token is a random string,
not a JWT: it is looked up on every MCP request anyway, to re-read the person's
role, so a signature would buy nothing and would make revocation wait for
expiry. The database holds an HMAC of each token, keyed from the Payload
secret, so a leaked table is no use without the secret — the same arrangement
Payload uses for API keys (`apiKeyIndex`).

**The authorization request travels sealed.** Between `/authorize` and the
consent screen the request is carried in the URL, HMAC-signed and dated, rather
than stored: nothing is written until somebody actually clicks Allow, so an
unauthenticated GET cannot fill a table.

Each use derives its own key from the Payload secret, so a value minted for one
purpose cannot be replayed as another.
*/

export const TOKEN_PREFIX = {
  access: 'tlo_at_',
  refresh: 'tlo_rt_',
  code: 'tlo_ac_',
  client: 'tlo_client_',
} as const

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

/** A fresh random token with a recognisable prefix. */
export function newToken(prefix: string): string {
  return `${prefix}${base64url(randomBytes(32))}`
}

/** A client id: shorter, because it is not a secret. */
export function newClientId(): string {
  return `${TOKEN_PREFIX.client}${base64url(randomBytes(16))}`
}

/** A key for one purpose, from the Payload secret. */
export function deriveKey(secret: string, purpose: 'token' | 'request'): Buffer {
  return createHmac('sha256', secret).update(`throughline:mcp-oauth:${purpose}`).digest()
}

/** What the database stores in place of a token. */
export function hashToken(key: Buffer, token: string): string {
  return createHmac('sha256', key).update(token).digest('hex')
}

/**
 * PKCE S256 (RFC 7636 §4.6). The verifier is 43–128 unreserved characters;
 * anything else fails before it is hashed.
 */
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false
  const computed = base64url(createHash('sha256').update(verifier).digest())
  const a = Buffer.from(computed)
  const b = Buffer.from(challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** A code challenge as RFC 7636 §4.2 shapes it: 43 base64url characters. */
export function isCodeChallenge(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
}

/** Signs `value` with an expiry, for carrying through a URL. */
export function seal(key: Buffer, value: object, ttlSeconds: number, now = Date.now()): string {
  const body = base64url(
    Buffer.from(JSON.stringify({ ...value, exp: Math.floor(now / 1000) + ttlSeconds })),
  )
  const mac = base64url(createHmac('sha256', key).update(body).digest())
  return `${body}.${mac}`
}

/**
 * The sealed value, if this server signed it and it has not expired. The MAC is
 * checked before anything is parsed.
 */
export function unseal<T extends object>(
  key: Buffer,
  sealed: unknown,
  now = Date.now(),
): T | undefined {
  if (typeof sealed !== 'string') return undefined
  const [body, mac, ...rest] = sealed.split('.')
  if (!body || !mac || rest.length > 0) return undefined
  const expected = Buffer.from(base64url(createHmac('sha256', key).update(body).digest()))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & {
      exp?: unknown
    }
    if (typeof value.exp !== 'number' || value.exp * 1000 < now) return undefined
    return value
  } catch {
    return undefined
  }
}

/**
 * HMAC-signed action tokens used in inline action emails (Approve / Decline /
 * Request changes / Discuss). Each token is bound to one approval, one
 * action, and one approver. Tokens are valid for a configurable window
 * (default 14 days) and consumed via the `consumedTokens` array on the
 * approval record so they can't be replayed.
 *
 * Crypto uses the Web Crypto API (`crypto.subtle`) so the same code runs
 * in Node and edge runtimes.
 */

export type ActionTokenAction = 'approve' | 'decline' | 'changes' | 'discuss'

export interface ActionToken {
  approvalId: string
  action: ActionTokenAction
  approverId: string
  /** Issued-at timestamp in milliseconds since epoch. */
  issuedAt: number
}

/**
 * How long an emailed action link stays usable.
 *
 * Was fourteen days, which outlived the thing the link acts on: `plugin.ts`
 * expires an approval request after seven (`expirationDays ?? 7`), so the
 * second week of a token's life could only ever act on something already gone.
 *
 * Seventy-two hours is what an approval actually needs. It covers a weekend,
 * which is the realistic gap between sending a request and somebody opening
 * their mail, and it is well inside the request's own expiry so the two cannot
 * disagree. `createExpireStaleApprovalsFunction` handles anything that ages
 * out either way.
 *
 * The token is otherwise well built — HMAC-SHA256, constant-time compare, bound
 * to one approval, action and approver, single-use, with a confirmation
 * interstitial — so this is narrowing a window rather than closing a hole.
 * forumone/forumone-2026#486, F-13.
 *
 * Overridable per call through `maxAgeMs`, which is unchanged.
 */
const DEFAULT_MAX_AGE_MS = 72 * 60 * 60 * 1000
const TOKEN_PARTS = 5
const VALID_ACTIONS = new Set<ActionTokenAction>(['approve', 'decline', 'changes', 'discuss'])
const ENCODER = new TextEncoder()

/**
 * Mints an action token. Returns a base64url-encoded payload with the
 * format `<approvalId>:<action>:<approverId>:<issuedAt>:<signature>`.
 */
export async function generateActionToken(
  token: ActionToken,
  secret: string,
): Promise<string> {
  ensureSafeForEncoding(token)
  const payload = `${token.approvalId}:${token.action}:${token.approverId}:${token.issuedAt}`
  const signature = await hmacSignHex(payload, secret)
  return base64UrlEncode(`${payload}:${signature}`)
}

export interface VerifyOptions {
  /** Override the default 14-day token lifetime. */
  maxAgeMs?: number
  /** Override "now" — useful in tests. Defaults to `Date.now()`. */
  now?: number
}

export type VerifyResult =
  | { ok: true; token: ActionToken }
  | { ok: false; error: string }

/**
 * Verifies a base64url-encoded action token with constant-time signature
 * comparison. Returns either the parsed token or a structured error.
 */
export async function verifyActionToken(
  encoded: string,
  secret: string,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  let decoded: string
  try {
    decoded = base64UrlDecode(encoded)
  } catch {
    return { ok: false, error: 'Token decode failed' }
  }

  const parts = decoded.split(':')
  if (parts.length !== TOKEN_PARTS) return { ok: false, error: 'Invalid token format' }

  const [approvalId, action, approverId, issuedAtRaw, providedSignature] = parts as [
    string,
    string,
    string,
    string,
    string,
  ]
  if (!approvalId || !action || !approverId || !issuedAtRaw || !providedSignature) {
    return { ok: false, error: 'Invalid token format' }
  }

  const issuedAt = Number.parseInt(issuedAtRaw, 10)
  if (!Number.isFinite(issuedAt)) {
    return { ok: false, error: 'Invalid token timestamp' }
  }

  if (!VALID_ACTIONS.has(action as ActionTokenAction)) {
    return { ok: false, error: 'Invalid action' }
  }

  const expectedSignature = await hmacSignHex(
    `${approvalId}:${action}:${approverId}:${issuedAt}`,
    secret,
  )
  if (!constantTimeEqual(providedSignature, expectedSignature)) {
    return { ok: false, error: 'Invalid token signature' }
  }

  const maxAge = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const now = options.now ?? Date.now()
  if (now - issuedAt > maxAge) {
    return { ok: false, error: 'Token has expired' }
  }

  return {
    ok: true,
    token: { approvalId, action: action as ActionTokenAction, approverId, issuedAt },
  }
}

/**
 * Returns the absolute URL an approver visits to invoke the action. The
 * server-side endpoint (added by the plugin) verifies the token and
 * presents a confirmation page before recording the decision.
 */
export function buildActionUrl(publicUrl: string, token: string): string {
  const base = publicUrl.replace(/\/$/, '')
  return `${base}/api/approvals/action?token=${encodeURIComponent(token)}`
}

async function hmacSignHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, ENCODER.encode(payload))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

function ensureSafeForEncoding(token: ActionToken): void {
  if (
    token.approvalId.includes(':') ||
    token.approverId.includes(':') ||
    token.action.includes(':')
  ) {
    throw new Error('Token field contains a reserved colon character')
  }
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64url')
}

function base64UrlDecode(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf-8')
}

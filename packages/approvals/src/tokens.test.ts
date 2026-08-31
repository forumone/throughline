import { describe, expect, it } from 'vitest'
import {
  buildActionUrl,
  generateActionToken,
  verifyActionToken,
} from './tokens.js'

const SECRET = 'a'.repeat(32)
const baseToken = {
  approvalId: 'apr_1',
  action: 'approve' as const,
  approverId: 'usr_1',
  issuedAt: 1_700_000_000_000,
}

describe('generateActionToken / verifyActionToken', () => {
  it('round-trips a valid token', async () => {
    const encoded = await generateActionToken(baseToken, SECRET)
    const verified = await verifyActionToken(encoded, SECRET, { now: baseToken.issuedAt })
    expect(verified.ok).toBe(true)
    if (verified.ok) {
      expect(verified.token).toEqual(baseToken)
    }
  })

  it('rejects a token signed with a different secret', async () => {
    const encoded = await generateActionToken(baseToken, SECRET)
    const verified = await verifyActionToken(encoded, 'b'.repeat(32), { now: baseToken.issuedAt })
    expect(verified.ok).toBe(false)
    if (!verified.ok) expect(verified.error).toMatch(/signature/i)
  })

  it('rejects a tampered payload', async () => {
    const encoded = await generateActionToken(baseToken, SECRET)
    const decoded = Buffer.from(encoded, 'base64url').toString('utf-8')
    const tampered = decoded.replace('apr_1', 'apr_2')
    const reEncoded = Buffer.from(tampered, 'utf-8').toString('base64url')
    const verified = await verifyActionToken(reEncoded, SECRET, { now: baseToken.issuedAt })
    expect(verified.ok).toBe(false)
  })

  it('rejects a malformed token', async () => {
    const verified = await verifyActionToken('not-a-token!!!', SECRET)
    expect(verified.ok).toBe(false)
  })

  it('rejects an expired token', async () => {
    const encoded = await generateActionToken(baseToken, SECRET)
    const fifteenDaysLater = baseToken.issuedAt + 15 * 24 * 60 * 60 * 1000
    const verified = await verifyActionToken(encoded, SECRET, { now: fifteenDaysLater })
    expect(verified.ok).toBe(false)
    if (!verified.ok) expect(verified.error).toMatch(/expired/i)
  })

  it('accepts a token inside seventy-two hours and refuses one outside it', async () => {
    /*
    Pins the default, which nothing asserted before. It was fourteen days —
    outliving the approval it acts on, since `plugin.ts` expires a request
    after seven (`expirationDays ?? 7`), so the second week of a token's life
    could only ever act on something already gone.

    Seventy-two hours covers a weekend, which is the realistic gap between
    sending a request and somebody opening their mail, and stays well inside
    the request's own expiry so the two cannot disagree.
    forumone/forumone-2026#486, F-13.
    */
    const encoded = await generateActionToken(baseToken, SECRET)
    const hours = (n: number) => baseToken.issuedAt + n * 60 * 60 * 1000

    expect((await verifyActionToken(encoded, SECRET, { now: hours(71) })).ok).toBe(true)
    expect((await verifyActionToken(encoded, SECRET, { now: hours(73) })).ok).toBe(false)
  })

  it('honors a custom maxAgeMs', async () => {
    const encoded = await generateActionToken(baseToken, SECRET)
    const oneHourLater = baseToken.issuedAt + 60 * 60 * 1000
    const verified = await verifyActionToken(encoded, SECRET, {
      now: oneHourLater,
      maxAgeMs: 30 * 60 * 1000, // 30 minutes
    })
    expect(verified.ok).toBe(false)
  })

  it('rejects unknown action values', async () => {
    // We can't pass an unknown action to generate (typed), but we can construct
    // one manually and base64-encode it.
    const payload = `${baseToken.approvalId}:invalid:${baseToken.approverId}:${baseToken.issuedAt}`
    const fakeSignature = 'deadbeef'.repeat(8)
    const reencoded = Buffer.from(`${payload}:${fakeSignature}`, 'utf-8').toString('base64url')
    const verified = await verifyActionToken(reencoded, SECRET, { now: baseToken.issuedAt })
    expect(verified.ok).toBe(false)
  })

  it('rejects token fields containing colons', async () => {
    await expect(
      generateActionToken(
        { ...baseToken, approvalId: 'apr:1' } as never,
        SECRET,
      ),
    ).rejects.toThrow(/colon/)
  })
})

describe('buildActionUrl', () => {
  it('appends the token as a query param', () => {
    const url = buildActionUrl('https://example.com', 'tok_1')
    expect(url).toBe('https://example.com/api/approvals/action?token=tok_1')
  })

  it('strips trailing slash', () => {
    const url = buildActionUrl('https://example.com/', 'tok_1')
    expect(url).toBe('https://example.com/api/approvals/action?token=tok_1')
  })

  it('url-encodes the token', () => {
    const url = buildActionUrl('https://example.com', 'a/b+c=')
    expect(url).toContain('token=a%2Fb%2Bc%3D')
  })
})

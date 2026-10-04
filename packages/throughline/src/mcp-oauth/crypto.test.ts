import { describe, expect, it } from 'vitest'
import { deriveKey, hashToken, isCodeChallenge, seal, unseal, verifyPkce } from './crypto.js'
import { isMetadataDocumentUrl } from './cimd.js'

describe('verifyPkce', () => {
  // RFC 7636 appendix B.
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

  it('accepts the RFC’s own example', () => {
    expect(isCodeChallenge(challenge)).toBe(true)
    expect(verifyPkce(verifier, challenge)).toBe(true)
  })

  it('refuses a different verifier, a short one and a missing one', () => {
    expect(verifyPkce(`${verifier.slice(0, -1)}A`, challenge)).toBe(false)
    expect(verifyPkce('short', challenge)).toBe(false)
    expect(verifyPkce(undefined, challenge)).toBe(false)
  })
})

describe('seal', () => {
  const key = deriveKey('a-secret-of-some-length-0000000000', 'request')

  it('round-trips within its lifetime', () => {
    const sealed = seal(key, { clientId: 'c' }, 60)
    expect(unseal<{ clientId: string }>(key, sealed)?.clientId).toBe('c')
  })

  it('refuses a tampered, foreign or expired value', () => {
    const sealed = seal(key, { clientId: 'c' }, 60)
    const [body, mac] = sealed.split('.')
    const forged = Buffer.from(JSON.stringify({ clientId: 'evil', exp: 9e9 })).toString('base64url')
    expect(unseal(key, `${forged}.${mac}`)).toBeUndefined()
    expect(
      unseal(deriveKey('another-secret-0000000000000000000', 'request'), sealed),
    ).toBeUndefined()
    expect(unseal(deriveKey('a-secret-of-some-length-0000000000', 'token'), sealed)).toBeUndefined()
    expect(unseal(key, sealed, Date.now() + 61_000)).toBeUndefined()
    expect(unseal(key, `${body}`)).toBeUndefined()
  })
})

describe('hashToken', () => {
  it('depends on the key', () => {
    const a = hashToken(deriveKey('secret-a-0000000000000000000000000', 'token'), 'tok')
    const b = hashToken(deriveKey('secret-b-0000000000000000000000000', 'token'), 'tok')
    expect(a).not.toBe(b)
  })
})

describe('isMetadataDocumentUrl', () => {
  it('fetches only public HTTPS URLs with a path', () => {
    expect(isMetadataDocumentUrl('https://claude.ai/oauth/claude-code-client-metadata')).toBe(true)
    for (const url of [
      'http://claude.ai/oauth/metadata',
      'https://claude.ai/',
      'https://localhost/metadata',
      'https://127.0.0.1/metadata',
      'https://[::1]/metadata',
      'https://metadata.internal/x',
      'https://claude.ai:8443/metadata',
      'https://user@claude.ai/metadata',
      'tlo_client_abc',
    ]) {
      expect(isMetadataDocumentUrl(url), url).toBe(false)
    }
  })
})

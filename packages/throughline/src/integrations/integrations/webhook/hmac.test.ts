import { describe, expect, it } from 'vitest'
import { hmacSha256Hex } from './hmac.js'

describe('hmacSha256Hex (known-answer tests)', () => {
  // Test vectors are pinned so a refactor of the implementation can never
  // silently change the wire signature. Recipients calibrated against these
  // outputs would otherwise reject every event.

  // RFC 4231 test case 1: key=20 bytes of 0x0b, data="Hi There"
  it('matches RFC 4231 case 1', async () => {
    const key = '\x0b'.repeat(20)
    const data = 'Hi There'
    const sig = await hmacSha256Hex(data, key)
    expect(sig).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7')
  })

  // RFC 4231 test case 2: key="Jefe", data="what do ya want for nothing?"
  it('matches RFC 4231 case 2', async () => {
    const sig = await hmacSha256Hex('what do ya want for nothing?', 'Jefe')
    expect(sig).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
  })

  it('produces a stable 64-char lowercase hex digest for an empty payload', async () => {
    const sig = await hmacSha256Hex('', 'secret')
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
    // The empty-payload signature is itself a useful regression target.
    expect(sig).toBe('f9e66e179b6747ae54108f82f8ade8b3c25d76fd30afde6c395822c530196169')
  })

  it('changes when the payload changes (avalanche)', async () => {
    const a = await hmacSha256Hex('payload-a', 'secret')
    const b = await hmacSha256Hex('payload-b', 'secret')
    expect(a).not.toBe(b)
  })
})

import { describe, expect, it } from 'vitest'
import { checkHoneypot } from './spam.js'

describe('checkHoneypot', () => {
  it('returns true when the honeypot is empty / missing', () => {
    expect(checkHoneypot(undefined)).toBe(true)
    expect(checkHoneypot(null)).toBe(true)
    expect(checkHoneypot('')).toBe(true)
    expect(checkHoneypot('   ')).toBe(true)
  })

  it('returns false when the honeypot has any string content', () => {
    expect(checkHoneypot('a')).toBe(false)
    expect(checkHoneypot('   X   ')).toBe(false)
  })

  it('returns false for non-string values (bots that send arrays / objects)', () => {
    expect(checkHoneypot(['x'])).toBe(false)
    expect(checkHoneypot({ x: 1 })).toBe(false)
    expect(checkHoneypot(0)).toBe(false)
  })
})

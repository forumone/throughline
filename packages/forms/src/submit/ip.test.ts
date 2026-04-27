import { describe, expect, it } from 'vitest'
import { extractClientIp, hashIp } from './ip.js'

describe('hashIp', () => {
  it('produces a stable 64-char lowercase hex digest', async () => {
    const sig = await hashIp('1.2.3.4', 'a'.repeat(32))
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })

  it('different IPs produce different hashes', async () => {
    const a = await hashIp('1.2.3.4', 'a'.repeat(32))
    const b = await hashIp('1.2.3.5', 'a'.repeat(32))
    expect(a).not.toBe(b)
  })

  it('different secrets produce different hashes for the same IP', async () => {
    const a = await hashIp('1.2.3.4', 'a'.repeat(32))
    const b = await hashIp('1.2.3.4', 'b'.repeat(32))
    expect(a).not.toBe(b)
  })

  it('the same input produces the same hash (idempotent)', async () => {
    const a = await hashIp('1.2.3.4', 'a'.repeat(32))
    const b = await hashIp('1.2.3.4', 'a'.repeat(32))
    expect(a).toBe(b)
  })
})

describe('extractClientIp', () => {
  it('picks the first IP from x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })
    expect(extractClientIp(headers)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '9.9.9.9' })
    expect(extractClientIp(headers)).toBe('9.9.9.9')
  })

  it('falls back to cf-connecting-ip', () => {
    const headers = new Headers({ 'cf-connecting-ip': '8.8.8.8' })
    expect(extractClientIp(headers)).toBe('8.8.8.8')
  })

  it('returns 0.0.0.0 when no proxy headers are set', () => {
    expect(extractClientIp(new Headers())).toBe('0.0.0.0')
  })
})

import { describe, expect, it } from 'vitest'
import { generateId } from './id.js'

describe('generateId', () => {
  it('produces a 24-character hex string by default', () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-f]{24}$/)
  })

  it('respects the prefix when provided', () => {
    const id = generateId('evt')
    expect(id).toMatch(/^evt_[0-9a-f]{24}$/)
  })

  it('produces different ids on subsequent calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()))
    expect(ids.size).toBe(50)
  })
})

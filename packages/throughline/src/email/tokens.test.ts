import { describe, expect, it } from 'vitest'
import { defaultTokens, mergeTokens } from './tokens.js'

describe('mergeTokens', () => {
  it('returns the defaults verbatim when no overrides are supplied', () => {
    expect(mergeTokens()).toEqual(defaultTokens)
    expect(mergeTokens({})).toEqual(defaultTokens)
  })

  it('overrides individual fields without dropping the rest', () => {
    const merged = mergeTokens({ brandName: 'Acme', brandPrimary: '#FF00AA' })
    expect(merged.brandName).toBe('Acme')
    expect(merged.brandPrimary).toBe('#FF00AA')
    expect(merged.textPrimary).toBe(defaultTokens.textPrimary)
  })

  it('does not mutate the defaults', () => {
    mergeTokens({ brandName: 'Acme' })
    expect(defaultTokens.brandName).toBe('Your Site')
  })
})

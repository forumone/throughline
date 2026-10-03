import { describe, expect, it } from 'vitest'
import { embargoStep } from './embargo.js'
import { makeContext } from '../_test-helpers.js'

describe('embargoStep', () => {
  it('passes when no policy is set', async () => {
    const result = await embargoStep(makeContext({ document: {} }))
    expect(result.pass).toBe(true)
  })

  it('fails when embargoedUntil is in the future', async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const result = await embargoStep(
      makeContext({ document: { policy: { embargoedUntil: future } } }),
    )
    expect(result.pass).toBe(false)
    expect(result.code).toBe('embargoed')
  })

  it('passes when embargoedUntil is in the past', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const result = await embargoStep(
      makeContext({ document: { policy: { embargoedUntil: past } } }),
    )
    expect(result.pass).toBe(true)
  })

  it('fails when expiresAt is in the past', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const result = await embargoStep(
      makeContext({ document: { policy: { expiresAt: past } } }),
    )
    expect(result.pass).toBe(false)
    expect(result.code).toBe('expired')
  })

  it('passes when expiresAt is in the future', async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const result = await embargoStep(
      makeContext({ document: { policy: { expiresAt: future } } }),
    )
    expect(result.pass).toBe(true)
  })

  it('ignores invalid date strings', async () => {
    const result = await embargoStep(
      makeContext({ document: { policy: { embargoedUntil: 'not-a-date' } } }),
    )
    expect(result.pass).toBe(true)
  })
})

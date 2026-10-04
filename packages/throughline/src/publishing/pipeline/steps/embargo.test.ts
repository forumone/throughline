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

  // forumone-2026#805: a person's date, in a named zone, and the instant for software.
  it('says the date as a person writes it, in the configured zone, and returns the instant', async () => {
    // Summer, so New York is on daylight time whenever this runs.
    const until = new Date('2099-07-06T13:00:00.000Z')
    const ctx = makeContext({ document: { policy: { embargoedUntil: until.toISOString() } } })
    ctx.options = { ...ctx.options, timeZone: 'America/New_York' }
    const result = await embargoStep(ctx)
    expect(result.when?.at).toBe(until.toISOString())
    expect(result.when?.text).toMatch(/^\w{3} \d{1,2} \w{3} \d{4}, 9:00 am GMT-4$/)
    expect(result.reason).toBe(`This can't go live until ${result.when?.text}.`)
    expect(result.suggestion).toBe(
      'Wait until then, change the embargo date, or schedule it to publish after that time.',
    )
  })

  it('writes UTC, named, when no zone is configured', async () => {
    const past = '2026-01-05T09:30:00.000Z'
    const result = await embargoStep(makeContext({ document: { policy: { expiresAt: past } } }))
    expect(result.reason).toBe('This content expired on Mon 5 Jan 2026, 9:30 am UTC.')
    expect(result.suggestion).toBe('Change the expiry date, or unpublish it.')
  })

  it('ignores invalid date strings', async () => {
    const result = await embargoStep(
      makeContext({ document: { policy: { embargoedUntil: 'not-a-date' } } }),
    )
    expect(result.pass).toBe(true)
  })
})

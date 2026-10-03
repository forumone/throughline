import { describe, expect, it } from 'vitest'
import type { Inngest } from 'inngest'
import { validateOptions } from './options.js'

const fakeInngest = {} as unknown as Inngest

describe('validateOptions', () => {
  it('accepts a valid options object', () => {
    const options = validateOptions({ inngest: fakeInngest })
    expect(options.inngest).toBe(fakeInngest)
  })

  it('throws when inngest is missing', () => {
    expect(() =>
      validateOptions({ inngest: undefined as unknown as Inngest }),
    ).toThrow(/requires an Inngest client/)
  })
})

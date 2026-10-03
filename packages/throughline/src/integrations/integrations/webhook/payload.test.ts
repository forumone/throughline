import { describe, expect, it } from 'vitest'
import { extractIds } from './payload.js'

describe('extractIds', () => {
  it('keeps id, slug, and *Id fields', () => {
    expect(
      extractIds({
        id: 'p1',
        slug: 'home',
        actorId: 'u-ada',
        targetId: 'p1',
        title: 'Homepage',
        body: 'lots of text',
      }),
    ).toEqual({ id: 'p1', slug: 'home', actorId: 'u-ada', targetId: 'p1' })
  })

  it('returns an empty object for non-objects', () => {
    expect(extractIds(null)).toEqual({})
    expect(extractIds(undefined)).toEqual({})
    expect(extractIds('string')).toEqual({})
    expect(extractIds(42)).toEqual({})
  })

  it('does not match unrelated keys ending in lowercase id', () => {
    expect(extractIds({ uuid: 'x', valid: true })).toEqual({})
  })
})

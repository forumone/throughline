import { describe, expect, it } from 'vitest'
import { shallowDiff } from './diff.js'

describe('shallowDiff', () => {
  it('returns empty when records are equal', () => {
    expect(shallowDiff({ a: 1, b: 'two' }, { a: 1, b: 'two' })).toEqual({})
  })

  it('captures changed primitive fields', () => {
    expect(shallowDiff({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({
      b: { before: 2, after: 3 },
    })
  })

  it('captures added and removed fields', () => {
    expect(shallowDiff({ a: 1 } as Record<string, unknown>, { b: 2 })).toEqual({
      a: { before: 1, after: undefined },
      b: { before: undefined, after: 2 },
    })
  })

  it('treats nested objects as deeply equal via JSON', () => {
    expect(shallowDiff({ a: { x: 1 } }, { a: { x: 1 } })).toEqual({})
    expect(shallowDiff({ a: { x: 1 } }, { a: { x: 2 } })).toEqual({
      a: { before: { x: 1 }, after: { x: 2 } },
    })
  })

  it('treats arrays as equal when JSON-equal', () => {
    expect(shallowDiff({ a: [1, 2] }, { a: [1, 2] })).toEqual({})
    expect(shallowDiff({ a: [1, 2] }, { a: [2, 1] })).toEqual({
      a: { before: [1, 2], after: [2, 1] },
    })
  })

  it('treats null and undefined as different', () => {
    expect(shallowDiff({ a: null } as Record<string, unknown>, { a: undefined })).toEqual({
      a: { before: null, after: undefined },
    })
  })
})

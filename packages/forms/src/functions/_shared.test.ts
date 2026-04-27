import { describe, expect, it } from 'vitest'
import { findFieldValue, formatHumanDate, readSubmissionRows } from './_shared.js'

describe('readSubmissionRows', () => {
  it('passes through Form Builder rows', () => {
    expect(
      readSubmissionRows([
        { field: 'name', value: 'Ada' },
        { field: 'count', value: 3 },
      ]),
    ).toEqual([
      { field: 'name', value: 'Ada' },
      { field: 'count', value: '3' },
    ])
  })

  it('flattens an object shape', () => {
    expect(readSubmissionRows({ name: 'Ada', count: 3 })).toEqual([
      { field: 'name', value: 'Ada' },
      { field: 'count', value: '3' },
    ])
  })

  it('returns an empty array for null / primitives', () => {
    expect(readSubmissionRows(null)).toEqual([])
    expect(readSubmissionRows(42)).toEqual([])
  })
})

describe('findFieldValue', () => {
  it('returns the matching value', () => {
    expect(
      findFieldValue([{ field: 'email', value: 'a@b.com' }], 'email'),
    ).toBe('a@b.com')
  })
  it('returns null when missing', () => {
    expect(findFieldValue([], 'email')).toBeNull()
  })
})

describe('formatHumanDate', () => {
  it('formats an ISO date as a human-readable string', () => {
    const out = formatHumanDate('2026-04-22T12:00:00.000Z')
    expect(out).toMatch(/Apr 22, 2026/)
  })
  it('returns the input verbatim for unparseable strings', () => {
    expect(formatHumanDate('not a date')).toBe('not a date')
  })
})

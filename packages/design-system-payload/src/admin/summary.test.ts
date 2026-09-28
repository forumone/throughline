import { describe, expect, it } from 'vitest'
import { rowSummary, SUMMARY_MAX } from './summary'

describe('a row header', () => {
  const fields = ['value', 'label']

  it("joins the row's text in the order the generator named the fields", () => {
    expect(rowSummary({ label: 'of users reached', value: '96%' }, fields, 'Stat', 0)).toBe(
      '96% · of users reached',
    )
  })

  it('shows what there is while the row is half filled', () => {
    expect(rowSummary({ value: '96%', label: '' }, fields, 'Stat', 0)).toBe('96%')
    expect(rowSummary({ label: '  of users  ' }, fields, 'Stat', 0)).toBe('of users')
  })

  it("is Payload's own counter, one-based and padded, while the row is empty", () => {
    expect(rowSummary({}, fields, 'Stat', 2)).toBe('Stat 03')
    expect(rowSummary(undefined, fields, 'Stat', 0)).toBe('Stat 01')
    expect(rowSummary({ value: '   ' }, fields, 'Stat', 9)).toBe('Stat 10')
  })

  it('ignores anything that is not text', () => {
    expect(rowSummary({ value: 7, label: { nested: true } }, fields, 'Stat', 0)).toBe('Stat 01')
  })

  it('reads a multi-line paragraph as one line, and stops at a length a header can hold', () => {
    const header = rowSummary({ value: 'one\ntwo', label: 'x'.repeat(200) }, fields, 'Stat', 0)
    expect(header.startsWith('one two · x')).toBe(true)
    expect(header).toHaveLength(SUMMARY_MAX)
    expect(header.endsWith('…')).toBe(true)
  })
})

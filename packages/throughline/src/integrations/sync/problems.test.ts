import { describe, expect, it } from 'vitest'
import { DEFAULT_PROBLEM_REPORT_LENGTH, problemReport, statusFromProblems } from './problems.js'

describe('problemReport', () => {
  it('is undefined when there is nothing to report', () => {
    expect(problemReport([])).toBeUndefined()
  })

  it('joins the problems when they fit', () => {
    expect(problemReport(['event 4: no name', 'form abc: no fields'])).toBe(
      'event 4: no name | form abc: no fields',
    )
  })

  it('caps a long report at the default length and says how many there were', () => {
    const many = Array.from({ length: 40 }, (_, i) => `record ${i}: the upstream sent a null title`)
    const report = problemReport(many) as string

    expect(report.length).toBeLessThanOrEqual(DEFAULT_PROBLEM_REPORT_LENGTH)
    expect(report.startsWith('record 0: the upstream sent a null title | record 1')).toBe(true)
    expect(report.endsWith(' … (40 problems in all)')).toBe(true)
  })

  it('returns a report exactly at the cap unchanged', () => {
    const exact = 'x'.repeat(DEFAULT_PROBLEM_REPORT_LENGTH)
    expect(problemReport([exact])).toBe(exact)
  })

  it('takes a different cap', () => {
    const report = problemReport(['a'.repeat(30), 'b'.repeat(30)], { maxLength: 40 }) as string
    expect(report.length).toBeLessThanOrEqual(40)
    expect(report).toMatch(/^a+ … \(2 problems in all\)$/)
  })

  it('never exceeds a cap shorter than its suffix', () => {
    const report = problemReport(['a'.repeat(30)], { maxLength: 10 }) as string
    expect(report.length).toBeLessThanOrEqual(10)
  })
})

describe('statusFromProblems', () => {
  it('is success with no message when nothing went wrong', () => {
    expect(statusFromProblems([])).toEqual(['success'])
  })

  it('is partial with the capped report otherwise', () => {
    expect(statusFromProblems(['job 7: no title'])).toEqual(['partial', 'job 7: no title'])
  })
})

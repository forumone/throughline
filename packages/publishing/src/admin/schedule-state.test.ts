import { describe, expect, it } from 'vitest'
import { formatScheduledTime, scheduleState } from './schedule-state.js'

const NOW = Date.parse('2026-10-01T12:00:00.000Z')

describe('scheduleState', () => {
  it.each([null, undefined, '', 'not a date', 42])('is none for %j', (value) => {
    expect(scheduleState(value, NOW)).toEqual({ kind: 'none' })
  })

  it('is upcoming for a future time', () => {
    expect(scheduleState('2026-10-03T13:00:00.000Z', NOW, 'en-US').kind).toBe('upcoming')
  })

  // The run wakes on the minute but still has to pass the pipeline. A page
  // opened in that moment should not claim the publish failed.
  it('is still upcoming for a moment after its time', () => {
    expect(scheduleState('2026-10-01T11:58:00.000Z', NOW, 'en-US').kind).toBe('upcoming')
  })

  // A publish clears the field, so a past time still on the document is a
  // publish that did not happen — and the editor is the one who needs to know.
  it('is overdue once it is well past its time', () => {
    expect(scheduleState('2026-10-01T11:00:00.000Z', NOW, 'en-US').kind).toBe('overdue')
  })
})

describe('formatScheduledTime', () => {
  it('names the zone, because two editors can read one time in two zones', () => {
    const label = formatScheduledTime(new Date('2026-10-03T13:00:00.000Z'), 'en-US')
    expect(label).toMatch(/2026/)
    expect(label).toMatch(/[A-Z]{2,5}|GMT|UTC/)
  })
})

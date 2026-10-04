import { describe, expect, it } from 'vitest'
import { formatScheduledTime, scheduleState, unscheduleOutcome } from './schedule-state.js'

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

  // forumone-2026#805: the one date form, everywhere.
  it('writes the date as a person does', () => {
    expect(formatScheduledTime(new Date('2026-10-06T13:00:00.000Z'), undefined, 'UTC')).toBe(
      'Tue 6 Oct 2026, 1:00 pm UTC',
    )
  })
})

describe('unscheduleOutcome', () => {
  it('says cancelled when it was', () => {
    expect(unscheduleOutcome({ unscheduled: true })).toEqual({
      kind: 'success',
      message: 'Schedule cancelled.',
      clear: true,
    })
  })

  // forumone-2026#805: it said "Schedule cancelled" for this too.
  it('says there was nothing to cancel, not that it cancelled something', () => {
    expect(
      unscheduleOutcome({
        unscheduled: false,
        code: 'not-scheduled',
        reason: 'There was nothing scheduled.',
      }),
    ).toEqual({ kind: 'info', message: 'There was nothing scheduled.', clear: true })
  })

  it('reports any other refusal as an error, and leaves the field as it is', () => {
    expect(
      unscheduleOutcome({ unscheduled: false, code: 'not-found', reason: 'Gone.' }),
    ).toEqual({ kind: 'error', message: 'Gone.', clear: false })
  })
})

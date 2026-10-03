import { describe, expect, it } from 'vitest'
import {
  calendarClock,
  defaultZoneLabel,
  gridDays,
  monthParam,
  monthTitle,
  queryRange,
  shiftMonth,
} from './month.js'

/*
The calendar's date arithmetic, ported from forumone-2026's
`admin/calendar/month.test.ts`. The failures worth guarding are the quiet ones:
an item on the wrong day near midnight, a grid that drops a week, a month
parameter that falls back somewhere surprising.
*/

const eastern = calendarClock('America/New_York')

describe('dayKey places an instant on its day in the site zone', () => {
  it('keeps a late evening on its own day, though UTC has moved on', () => {
    // 11:30 PM EDT on 1 October is 03:30 UTC on 2 October.
    expect(eastern.dayKey('2026-10-02T03:30:00.000Z')).toBe('2026-10-01')
  })

  it('follows daylight saving time', () => {
    expect(eastern.dayKey('2026-12-02T04:30:00.000Z')).toBe('2026-12-01')
    expect(eastern.dayKey('2026-12-02T05:30:00.000Z')).toBe('2026-12-02')
  })

  it('is a different day in a different site zone', () => {
    expect(calendarClock('Europe/London').dayKey('2026-10-02T03:30:00.000Z')).toBe('2026-10-02')
  })
})

describe('parseMonth', () => {
  const now = new Date('2026-10-02T03:30:00.000Z') // still 1 October in Eastern time

  it('reads ?month=', () => {
    expect(eastern.parseMonth('2027-01', now)).toEqual({ year: 2027, month: 1 })
  })

  it("falls back to the site zone's month, not the UTC one", () => {
    expect(eastern.parseMonth(undefined, new Date('2026-11-01T02:00:00.000Z'))).toEqual({
      year: 2026,
      month: 10,
    })
  })

  it.each(['2026-13', '2026-1', 'October', '1999-05', ['2026-10']])(
    'ignores a malformed %j',
    (value) => {
      expect(eastern.parseMonth(value, now)).toEqual({ year: 2026, month: 10 })
    },
  )
})

describe('month navigation', () => {
  it('crosses year boundaries', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
  })

  it('writes and titles a month', () => {
    expect(monthParam({ year: 2026, month: 3 })).toBe('2026-03')
    expect(monthTitle({ year: 2026, month: 3 })).toBe('March 2026')
  })
})

describe('gridDays', () => {
  it('is whole weeks, Sunday first, covering the month', () => {
    const days = gridDays({ year: 2026, month: 10 })
    expect(days[0]).toBe('2026-09-27')
    expect(days.at(-1)).toBe('2026-10-31')
    expect(days).toHaveLength(35)
  })

  it('runs to six weeks when the month needs them', () => {
    const days = gridDays({ year: 2026, month: 8 })
    expect(days).toHaveLength(42)
    expect(days[0]).toBe('2026-07-26')
  })

  it('counts every day once across the daylight saving change', () => {
    const days = gridDays({ year: 2026, month: 11 })
    expect(new Set(days).size).toBe(days.length)
    expect(days).toContain('2026-11-01')
  })
})

describe('queryRange', () => {
  it('reaches past both ends of the grid, so an evening on the last day is kept', () => {
    const { from, to } = queryRange(gridDays({ year: 2026, month: 10 }))
    expect(from <= '2026-09-27T04:00:00.000Z').toBe(true)
    expect(to > '2026-11-01T03:30:00.000Z').toBe(true)
  })
})

describe('timeLabel', () => {
  it("gives site time, and the event's own time when it was entered elsewhere", () => {
    expect(eastern.timeLabel('2026-10-01T18:00:00.000Z')).toBe('2:00 PM ET')
    expect(eastern.timeLabel('2026-10-01T18:00:00.000Z', 'America/New_York')).toBe('2:00 PM ET')
    expect(eastern.timeLabel('2026-10-01T18:00:00.000Z', 'America/Los_Angeles')).toBe(
      '2:00 PM ET (11:00 AM PT)',
    )
  })

  it('ignores an own zone that is not a zone', () => {
    expect(eastern.timeLabel('2026-10-01T18:00:00.000Z', 'Mars/Olympus')).toBe('2:00 PM ET')
  })

  it("uses the site's own labels when given them", () => {
    const labels: Record<string, string> = {
      'America/New_York': 'ET',
      'Europe/London': 'London time',
    }
    const clock = calendarClock(
      'America/New_York',
      (zone) => labels[zone] ?? defaultZoneLabel(zone),
    )
    expect(clock.label).toBe('ET')
    expect(clock.timeLabel('2026-10-01T18:00:00.000Z', 'Europe/London')).toBe(
      '2:00 PM ET (7:00 PM London time)',
    )
  })

  it('refuses a site zone Intl does not know', () => {
    expect(() => calendarClock('Eastern')).toThrow(/not an IANA time zone/)
  })
})

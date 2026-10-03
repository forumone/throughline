import type { Payload, PayloadRequest } from 'payload'
import { findContentCalendar, type CalendarItem, type CalendarSources } from './find.js'
import {
  calendarClock,
  gridDays,
  monthParam,
  queryRange,
  type CalendarClock,
  type Month,
} from './month.js'

/*
One month of the calendar, as both the view and `get_content_calendar` see it.
They call this with the same options, so an editor looking at the grid and an
agent asking the tool get the same items on the same days.
*/

export interface CalendarOptions extends CalendarSources {
  /** The site's IANA zone. Every item is placed on its day there. */
  timeZone: string
  /** "ET" for `America/New_York`. Default: Intl's short generic name. */
  zoneLabel?: (zone: string) => string
}

export interface CalendarMonth {
  month: Month
  /** Every day on the grid, whole weeks, Sunday first. */
  days: string[]
  /** Items by day key, sorted by time. */
  items: Map<string, CalendarItem[]>
  /** Today's key, in the site's zone. */
  today: string
  clock: CalendarClock
}

export function clockFor(options: CalendarOptions): CalendarClock {
  return calendarClock(options.timeZone, options.zoneLabel)
}

export async function readCalendarMonth(
  payload: Payload,
  options: {
    calendar: CalendarOptions
    user: PayloadRequest['user']
    /** `2026-10`; anything else means the current month. */
    month?: unknown
    now?: Date
  },
): Promise<CalendarMonth> {
  const clock = clockFor(options.calendar)
  const now = options.now ?? new Date()
  const month = clock.parseMonth(options.month, now)
  const days = gridDays(month)
  const items = await findContentCalendar(payload, {
    sources: options.calendar,
    clock,
    user: options.user,
    range: queryRange(days),
  })
  return { month, days, items, today: clock.dayKey(now), clock }
}

/** The days of the month itself, without the grid's lead-in and run-out. */
export function daysInMonth(calendar: CalendarMonth): string[] {
  return calendar.days.filter((key) => key.startsWith(monthParam(calendar.month)))
}

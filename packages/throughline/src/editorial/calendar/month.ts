/*
The calendar's date arithmetic, pure so the suite can hold it. From
forumone-2026's `admin/calendar/month.ts` (#761 there), with the site's zone
made an argument.

**Everything is placed in one zone, the site's.** An item belongs to the day it
falls on there, so two editors in different zones see the same grid. A calendar
day is a string key, `YYYY-MM-DD`, never a `Date`: a `Date` is an instant, and
"which day is this instant on" is only answerable once a zone is chosen.
`calendarClock(zone).dayKey` is the one place that choice is made.

The grid is whole weeks, Sunday first, covering the month. Days are counted with
`Date.UTC`, which has no daylight saving time, so adding a day is always
86,400,000 ms.
*/

export interface Month {
  year: number
  /** 1–12. */
  month: number
}

const DAY_MS = 86_400_000

/** `2026-10`, as the query string carries it. */
export function monthParam({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** The month `delta` months from `from`. */
export function shiftMonth(from: Month, delta: number): Month {
  const index = from.year * 12 + (from.month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

const keyOfUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Every day key in the grid: whole weeks, Sunday first, covering the month. */
export function gridDays({ year, month }: Month): string[] {
  const first = Date.UTC(year, month - 1, 1)
  const last = Date.UTC(year, month, 0)
  const start = first - new Date(first).getUTCDay() * DAY_MS
  const end = last + (6 - new Date(last).getUTCDay()) * DAY_MS
  const days: string[] = []
  for (let ms = start; ms <= end; ms += DAY_MS) days.push(keyOfUtc(ms))
  return days
}

/**
 * The instants to query between so nothing on the grid is missed. No zone is
 * more than fourteen hours from UTC, so a day either side is enough; the extra
 * rows are dropped when items are bucketed by `dayKey`.
 */
export function queryRange(days: readonly string[]): { from: string; to: string } {
  const first = Date.parse(`${days[0]}T00:00:00.000Z`) - DAY_MS
  const last = Date.parse(`${days[days.length - 1]}T00:00:00.000Z`) + 2 * DAY_MS
  return { from: new Date(first).toISOString(), to: new Date(last).toISOString() }
}

/** "October 2026". */
export function monthTitle({ year, month }: Month): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

/** "Thursday, October 1", for the agenda list. */
export function dayTitle(key: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${key}T00:00:00.000Z`))
}

/** What follows a time: "ET". Intl's short generic name, e.g. "ET", "PT". */
export function defaultZoneLabel(zone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortGeneric' })
    .formatToParts(new Date(0))
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? zone
}

function isZone(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export interface CalendarClock {
  zone: string
  /** The zone's label: "ET". */
  label: string
  /** The calendar day an instant falls on, in the site's zone. */
  dayKey: (instant: string | Date) => string
  /** `?month=2026-10`, or the current month in the site's zone when absent or malformed. */
  parseMonth: (param: unknown, now: Date) => Month
  /**
   * The time of an item in the site's zone, and in its own zone too when that
   * differs: "2:00 PM ET (11:00 AM PT)". An event entered in Pacific time is
   * still placed on the site's day, and the second clause keeps what its author
   * typed.
   */
  timeLabel: (instant: string, ownZone?: unknown) => string
}

/** The zone-bound half of the arithmetic. */
export function calendarClock(
  zone: string,
  zoneLabel: (zone: string) => string = defaultZoneLabel,
): CalendarClock {
  if (!isZone(zone)) throw new Error(`calendarClock: "${zone}" is not an IANA time zone.`)
  const keyFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const dayKey = (instant: string | Date) =>
    keyFormat.format(typeof instant === 'string' ? new Date(instant) : instant)
  const clock = (instant: string, at: string) =>
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: at }).format(
      new Date(instant),
    )

  return {
    zone,
    label: zoneLabel(zone),
    dayKey,
    parseMonth: (param, now) => {
      if (typeof param === 'string') {
        const match = /^(\d{4})-(\d{2})$/.exec(param)
        if (match) {
          const year = Number(match[1])
          const month = Number(match[2])
          if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return { year, month }
        }
      }
      const [year, month] = dayKey(now).split('-').map(Number)
      return { year: year!, month: month! }
    },
    timeLabel: (instant, ownZone) => {
      const site = `${clock(instant, zone)} ${zoneLabel(zone)}`
      if (!isZone(ownZone) || ownZone === zone) return site
      return `${site} (${clock(instant, ownZone)} ${zoneLabel(ownZone)})`
    },
  }
}

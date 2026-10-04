/**
 * What the Schedule control says about a stored scheduled time. No JSX, so it
 * can be tested without a form.
 */

import { formatHumanDate } from '../messages.js'

export type ScheduleState =
  | { kind: 'none' }
  | { kind: 'upcoming'; at: Date; label: string }
  /**
   * Past its time and still sitting on the latest version. A publish clears
   * the field, so this means the scheduled publish was refused — a check that
   * failed on the day — or has not run yet. The editor is the only person who
   * will see this, which is why it is said here rather than only logged.
   */
  | { kind: 'overdue'; at: Date; label: string }

/**
 * How long past its time a schedule may be before it is called overdue. The
 * run wakes on the minute, but it still has to load the document and pass the
 * pipeline; a page opened in that moment should not claim a failure.
 */
const OVERDUE_AFTER_MS = 5 * 60 * 1000

export function scheduleState(value: unknown, now: number, locale?: string): ScheduleState {
  if (typeof value !== 'string') return { kind: 'none' }
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return { kind: 'none' }

  const label = formatScheduledTime(at, locale)
  return now - at.getTime() > OVERDUE_AFTER_MS
    ? { kind: 'overdue', at, label }
    : { kind: 'upcoming', at, label }
}

/**
 * The time in the editor's own zone, with the zone named: `Tue 6 Oct 2026,
 * 9:00 am EDT`. An editor in London and one in New York looking at the same
 * post see different wall-clock times, and each needs to know which one they
 * are reading. The same form as every other date the admin shows
 * (forumone-2026#805); `_locale` is no longer read.
 */
export function formatScheduledTime(at: Date, _locale?: string, timeZone?: string): string {
  return formatHumanDate(at, { zoneName: true, ...(timeZone ? { timeZone } : {}) })
}

/** What the Schedule control says after a cancel, and whether the field empties. */
export type UnscheduleOutcome =
  | { kind: 'success'; message: string; clear: true }
  | { kind: 'info'; message: string; clear: true }
  | { kind: 'error'; message: string; clear: false }

/**
 * A cancel that found nothing to cancel is not a cancellation, and used to
 * say "Schedule cancelled" anyway (forumone-2026#805). The field still empties
 * — nothing scheduled is what the editor asked for — but the toast says what
 * was true.
 */
export function unscheduleOutcome(body: {
  unscheduled?: boolean
  code?: string
  reason?: string
}): UnscheduleOutcome {
  if (body.unscheduled) return { kind: 'success', message: 'Schedule cancelled.', clear: true }
  if (body.code === 'not-scheduled') {
    return { kind: 'info', message: body.reason ?? 'There was nothing scheduled.', clear: true }
  }
  return {
    kind: 'error',
    message: body.reason ?? "The schedule couldn't be cancelled. Nothing was changed.",
    clear: false,
  }
}

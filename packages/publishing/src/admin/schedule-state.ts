/**
 * What the Schedule control says about a stored scheduled time. No JSX, so it
 * can be tested without a form.
 */

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
 * The time in the editor's own zone, with the zone named. An editor in London
 * and one in New York looking at the same post see different wall-clock
 * times, and each needs to know which one they are reading.
 */
export function formatScheduledTime(at: Date, locale?: string): string {
  // Spelled out rather than `dateStyle`/`timeStyle`, which the spec forbids
  // alongside `timeZoneName` — the constructor throws, in browsers too.
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(at)
}

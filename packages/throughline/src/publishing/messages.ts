/**
 * Words an editor reads, shared by the server that writes them and the admin
 * that shows them. No imports, so the admin bundle can take it.
 *
 * forumone-2026#805 is the brief: say what happened in the editor's terms, say
 * what to do next, name who can fix it when the editor cannot — always "a site
 * administrator", because Throughline serves more than one site and none of
 * them should name a team here — and print a date as a person writes one.
 * Detail a developer needs goes in the log and in the result's `detail`, where
 * an MCP caller still has it alongside `code`.
 */

/** The one phrase for "somebody else has to fix this". */
export const TELL_AN_ADMINISTRATOR = 'tell a site administrator'

/** "Try again; if it keeps happening, tell a site administrator." */
export const TRY_AGAIN = `Try again; if it keeps happening, ${TELL_AN_ADMINISTRATOR}.`

/**
 * A block no editor can fix: the site is set up wrongly. The setup instruction
 * goes in the result's `detail` and the log, not here.
 */
export const PUBLISHING_UNAVAILABLE = `Publishing isn't working right now. Nothing was changed. Please ${TELL_AN_ADMINISTRATOR}.`

/** When the response from the publishing endpoint was not one it could read. */
export const UNEXPECTED_PROBLEM = (action: 'publish' | 'unpublish' | 'schedule' | 'unschedule') =>
  `This couldn't be ${PAST_TENSE[action]} because of an unexpected problem. Nothing was changed. ${TRY_AGAIN}`

const PAST_TENSE = {
  publish: 'published',
  unpublish: 'unpublished',
  schedule: 'scheduled',
  unschedule: 'unscheduled',
} as const

export interface HumanDateOptions {
  /**
   * An IANA zone, e.g. `America/New_York`. Omitted, the runtime's own zone —
   * which in a browser is the editor's.
   */
  timeZone?: string | undefined
  /** Whether to name the zone after the time. Say it whenever the reader's own zone is not the one used. */
  zoneName?: boolean | undefined
}

/**
 * `Tue 6 Oct 2026, 9:00 am`, or `Tue 6 Oct 2026, 1:00 pm UTC` with the zone
 * named.
 *
 * Put together from parts rather than taken whole from `Intl`, whose `en-GB`
 * output puts a comma after the weekday and whose `en-US` output puts the
 * month first. The pieces are still `Intl`'s, so the zone arithmetic is too.
 */
export function formatHumanDate(at: Date, options: HumanDateOptions = {}): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    ...(options.zoneName ? { timeZoneName: 'short' as const } : {}),
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''

  const time = `${part('hour')}:${part('minute')} ${part('dayPeriod').toLowerCase()}`
  const zone = options.zoneName ? ` ${part('timeZoneName')}` : ''
  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}, ${time}${zone}`
}

/**
 * A date a message is about, in both forms: `at` for software, `text` as the
 * server wrote it into the message. The admin swaps `text` for the same instant
 * in the editor's own zone, which the server cannot know.
 */
export interface MessageDate {
  at: string
  text: string
}

/**
 * The time the server writes into a message: in the zone the site configured,
 * named, because the reader may be anywhere.
 */
export function messageDate(at: Date | number, timeZone?: string): MessageDate {
  const date = new Date(at)
  return {
    at: date.toISOString(),
    text: formatHumanDate(date, { timeZone: timeZone ?? 'UTC', zoneName: true }),
  }
}

/**
 * Rewrites a message's server-written date into the reader's own zone. A
 * message with no date, or whose text no longer contains it, comes back as it
 * was.
 */
export function localiseMessage(
  message: string,
  date: MessageDate | undefined,
  options: HumanDateOptions = {},
): string {
  if (!date || !message.includes(date.text)) return message
  const at = new Date(date.at)
  if (Number.isNaN(at.getTime())) return message
  return message.split(date.text).join(formatHumanDate(at, options))
}

/** `1 block` / `3 blocks`. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

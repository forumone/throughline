import { describe, expect, it } from 'vitest'
import { formatHumanDate, localiseMessage, messageDate, plural } from './messages.js'

const AT = new Date('2026-10-06T13:00:00.000Z')

describe('formatHumanDate', () => {
  // The form forumone-2026#805 asks for, not Intl's `Tue, 6 Oct` or `Oct 6`.
  it('writes a date the way a person does', () => {
    expect(formatHumanDate(AT, { timeZone: 'America/New_York' })).toBe('Tue 6 Oct 2026, 9:00 am')
    expect(formatHumanDate(AT, { timeZone: 'UTC' })).toBe('Tue 6 Oct 2026, 1:00 pm')
  })

  it('names the zone when asked', () => {
    expect(formatHumanDate(AT, { timeZone: 'UTC', zoneName: true })).toBe(
      'Tue 6 Oct 2026, 1:00 pm UTC',
    )
  })

  it('writes midnight and noon as 12', () => {
    expect(formatHumanDate(new Date('2026-10-06T00:05:00Z'), { timeZone: 'UTC' })).toBe(
      'Tue 6 Oct 2026, 12:05 am',
    )
    expect(formatHumanDate(new Date('2026-10-06T12:00:00Z'), { timeZone: 'UTC' })).toBe(
      'Tue 6 Oct 2026, 12:00 pm',
    )
  })
})

describe('messageDate and localiseMessage', () => {
  it('writes the server’s date in its zone, and the admin swaps in the reader’s', () => {
    const when = messageDate(AT, 'UTC')
    expect(when).toEqual({ at: AT.toISOString(), text: 'Tue 6 Oct 2026, 1:00 pm UTC' })

    const message = `This can't go live until ${when.text}.`
    expect(localiseMessage(message, when, { timeZone: 'Europe/London' })).toBe(
      "This can't go live until Tue 6 Oct 2026, 2:00 pm.",
    )
  })

  it('leaves a message alone when it has no date, or no longer contains it', () => {
    expect(localiseMessage('Nothing here.', undefined)).toBe('Nothing here.')
    expect(localiseMessage('Changed.', messageDate(AT))).toBe('Changed.')
  })
})

describe('plural', () => {
  it('counts', () => {
    expect(plural(1, 'block')).toBe('1 block')
    expect(plural(3, 'block')).toBe('3 blocks')
  })
})

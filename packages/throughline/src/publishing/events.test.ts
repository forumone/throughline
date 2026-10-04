import { describe, expect, it, vi } from 'vitest'
import type { Inngest } from 'inngest'
import { EVENT_NOT_SENT, sendEventSafely } from './events.js'

function fakeInngest(send: () => Promise<unknown>): Inngest {
  return { send: vi.fn(send) } as unknown as Inngest
}

describe('sendEventSafely', () => {
  it('returns null when the event goes out', async () => {
    const inngest = fakeInngest(async () => ({ ids: ['1'] }))
    const result = await sendEventSafely(inngest, {
      name: 'content/page.published',
      data: {},
    })
    expect(result).toBeNull()
  })

  // forumone-2026#805: the editor reads what they will see; the log says why.
  it('returns a warning for the editor, and logs the event and the cause, instead of throwing', async () => {
    const inngest = fakeInngest(async () => {
      throw new Error('Inngest API Error: 401 Event key not found')
    })
    const warn = vi.fn()

    const result = await sendEventSafely(
      inngest,
      { name: 'content/page.published', data: {} },
      { warn },
    )

    expect(result).toBe(EVENT_NOT_SENT)
    expect(result).toMatch(/tell a site administrator\.$/)
    expect(result).not.toMatch(/event|Inngest|401/)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('content/page.published')
    expect(warn.mock.calls[0]![0]).toContain('401 Event key not found')
  })

  it('handles a non-Error rejection', async () => {
    const inngest = fakeInngest(async () => {
      throw 'socket hang up'
    })
    const warn = vi.fn()
    await expect(
      sendEventSafely(inngest, { name: 'content/page.published', data: {} }, { warn }),
    ).resolves.toBe(EVENT_NOT_SENT)
    expect(warn.mock.calls[0]![0]).toContain('socket hang up')
  })
})

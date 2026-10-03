import { describe, expect, it, vi } from 'vitest'
import type { Inngest } from 'inngest'
import { sendEventSafely } from './events.js'

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

  it('returns a warning naming the event and the cause instead of throwing', async () => {
    const inngest = fakeInngest(async () => {
      throw new Error('Inngest API Error: 401 Event key not found')
    })

    const result = await sendEventSafely(inngest, {
      name: 'content/page.published',
      data: {},
    })

    expect(result).toContain('content/page.published')
    expect(result).toContain('401 Event key not found')
  })

  it('handles a non-Error rejection', async () => {
    const inngest = fakeInngest(async () => {
      throw 'socket hang up'
    })
    await expect(
      sendEventSafely(inngest, { name: 'content/page.published', data: {} }),
    ).resolves.toContain('socket hang up')
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { Inngest } from 'inngest'
import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { createSendScheduledEventHook } from './schedule-events.js'

function setup(send = vi.fn(async () => ({}))) {
  const hook = createSendScheduledEventHook({
    inngest: { send } as unknown as Inngest,
    scheduledPublishField: 'scheduledPublishAt',
  })
  const warn = vi.fn()
  const run = (doc: Record<string, unknown>, previousDoc: Record<string, unknown> = {}) =>
    hook({
      collection: { slug: 'posts' },
      doc,
      previousDoc,
      req: { payload: { logger: { warn } } } as unknown as PayloadRequest,
      operation: 'update',
      context: {},
    } as unknown as Parameters<CollectionAfterChangeHook>[0])
  return { send, warn, run }
}

describe('createSendScheduledEventHook', () => {
  it('wakes the scheduled-publish run when a time is set', async () => {
    const { send, run } = setup()
    await run({ id: 7, scheduledPublishAt: '2026-10-03T13:00:00.000Z' })
    expect(send).toHaveBeenCalledWith({
      name: 'content/page.scheduled',
      data: { collection: 'posts', id: '7', scheduledFor: '2026-10-03T13:00:00.000Z' },
    })
  })

  it('sends again when the time changes', async () => {
    const { send, run } = setup()
    await run(
      { id: 7, scheduledPublishAt: '2026-10-04T13:00:00.000Z' },
      { id: 7, scheduledPublishAt: '2026-10-03T13:00:00.000Z' },
    )
    expect(send).toHaveBeenCalledTimes(1)
  })

  /*
  Autosave writes a version every few seconds, each carrying the schedule
  unchanged. One event per keystroke would be a sleeping run per keystroke.
  */
  it('sends nothing for a save that did not change the time', async () => {
    const { send, run } = setup()
    await run(
      { id: 7, scheduledPublishAt: '2026-10-03T13:00:00.000Z' },
      // Same instant, written differently.
      { id: 7, scheduledPublishAt: '2026-10-03T09:00:00-04:00' },
    )
    expect(send).not.toHaveBeenCalled()
  })

  it('sends nothing when the time is cleared', async () => {
    const { send, run } = setup()
    await run(
      { id: 7, scheduledPublishAt: null },
      { id: 7, scheduledPublishAt: '2026-10-03T13:00:00.000Z' },
    )
    expect(send).not.toHaveBeenCalled()
  })

  it('logs, and does not fail the save, when the event cannot be sent', async () => {
    const { warn, run } = setup(
      vi.fn(async () => {
        throw new Error('inngest unreachable')
      }),
    )
    const doc = { id: 7, scheduledPublishAt: '2026-10-03T13:00:00.000Z' }
    await expect(run(doc)).resolves.toBe(doc)
    expect(warn).toHaveBeenCalled()
  })
})

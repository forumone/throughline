import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExecuteScheduledPublishesFunction } from './execute-scheduled-publishes.js'
import { createFakeInngest, createFakePayload } from './_test-helpers.js'

describe('createExecuteScheduledPublishesFunction', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('registers a cron trigger with the configured schedule', () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    createExecuteScheduledPublishesFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      collections: [{ slug: 'pages' }],
      publish: async () => ({ published: true }),
      schedule: '0 * * * *',
    })
    const triggers = fakeInngest.functions[0]?.options['triggers'] as Array<{ cron: string }>
    expect(triggers).toEqual([{ cron: '0 * * * *' }])
  })

  it('publishes only documents whose scheduled time has passed', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload([
      { id: 'p1', _status: 'draft', title: 'Past', scheduledPublishAt: '2026-04-22T11:00:00.000Z' },
      { id: 'p2', _status: 'draft', title: 'Future', scheduledPublishAt: '2026-04-22T13:00:00.000Z' },
      { id: 'p3', _status: 'published', title: 'Already live', scheduledPublishAt: '2026-04-22T11:00:00.000Z' },
    ])
    const publish = vi.fn(async () => ({ published: true }))

    createExecuteScheduledPublishesFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      collections: [{ slug: 'pages' }],
      publish,
    })

    const result = (await fakeInngest.invoke('execute-scheduled-publishes', {
      name: 'inngest/function.invoked',
      data: {},
    })) as { publishedCount: number; blockedCount: number }

    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith({
      collection: 'pages',
      id: 'p1',
      reasoning: 'Scheduled publish executed by workflow cron',
    })
    expect(result.publishedCount).toBe(1)
  })

  /*
  A refusal is expected traffic, not a fault: it is what a composition error or a
  missing approval looks like from here. Counted separately and not retried,
  because a permanent refusal retried on a cron is an infinite loop.
  */
  it('counts policy refusals separately and does not retry', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload([
      { id: 'p1', _status: 'draft', title: 'Past', scheduledPublishAt: '2026-04-22T11:00:00.000Z' },
    ])
    const publish = vi.fn(async () => ({
      published: false,
      reason: 'composition failed: missing hero',
    }))

    createExecuteScheduledPublishesFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      collections: [{ slug: 'pages' }],
      publish,
    })

    const result = (await fakeInngest.invoke('execute-scheduled-publishes', {
      name: 'inngest/function.invoked',
      data: {},
    })) as { publishedCount: number; blockedCount: number }
    expect(publish).toHaveBeenCalledTimes(1)
    expect(result.publishedCount).toBe(0)
    expect(result.blockedCount).toBe(1)
  })

  /*
  A thrown `publish` is neither published nor blocked. It counts as neither, and
  the tick still completes for the remaining documents — one document's failure
  is not the collection's.
  */
  it('survives a publish that throws, and keeps going', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload([
      { id: 'p1', _status: 'draft', title: 'First', scheduledPublishAt: '2026-04-22T11:00:00.000Z' },
      { id: 'p2', _status: 'draft', title: 'Second', scheduledPublishAt: '2026-04-22T11:30:00.000Z' },
    ])
    const publish = vi.fn(async ({ id }: { id: string }) => {
      if (id === 'p1') throw new Error('publishing service not attached')
      return { published: true }
    })

    createExecuteScheduledPublishesFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      collections: [{ slug: 'pages' }],
      publish,
    })

    const result = (await fakeInngest.invoke('execute-scheduled-publishes', {
      name: 'inngest/function.invoked',
      data: {},
    })) as { publishedCount: number; blockedCount: number }

    expect(publish).toHaveBeenCalledTimes(2)
    expect(result.publishedCount).toBe(1)
    expect(result.blockedCount).toBe(0)
  })

  /*
  The whole point of injecting `publish` rather than writing to Payload here: a
  scheduled publish must pass the same gates as an interactive one. Asserted as
  "this function never writes" — the fake payload records updates, and there must
  be none.
  */
  it('never writes to Payload itself', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload([
      { id: 'p1', _status: 'draft', title: 'Past', scheduledPublishAt: '2026-04-22T11:00:00.000Z' },
    ])

    createExecuteScheduledPublishesFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      collections: [{ slug: 'pages' }],
      publish: async () => ({ published: true }),
    })

    await fakeInngest.invoke('execute-scheduled-publishes', {
      name: 'inngest/function.invoked',
      data: {},
    })

    expect(payloadHandle.updates).toEqual([])
  })
})

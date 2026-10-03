import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publishAtScheduledTimeJob } from './publish-at-scheduled-time.js'
import {
  createFakeInngest,
  createFakePayload,
  asInngestFunction,
} from '../../jobs/_test-helpers.js'

const NOW = Date.parse('2026-04-22T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function scheduled(scheduledFor: string, id = 'p1', collection = 'posts') {
  return { name: 'content/page.scheduled', data: { collection, id, scheduledFor }, ts: NOW }
}

function setup(
  docs: Array<Record<string, unknown>>,
  publish = vi.fn(async () => ({ published: true })),
) {
  const fakeInngest = createFakeInngest()
  const payloadHandle = createFakePayload(docs)
  asInngestFunction(publishAtScheduledTimeJob, {
    inngest: fakeInngest.inngest,
    payload: payloadHandle.payload,
    collections: [{ slug: 'posts' }, { slug: 'events' }],
    publish,
  })
  const run = (event: ReturnType<typeof scheduled>) =>
    fakeInngest.invoke('publish-at-scheduled-time', event) as Promise<{ outcome: string }>
  return { fakeInngest, payloadHandle, publish, run }
}

describe('publishAtScheduledTimeJob', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('wakes on the scheduled event, one run per schedule', () => {
    const { fakeInngest } = setup([])
    const options = fakeInngest.functions[0]?.options
    expect(options?.['triggers']).toEqual([{ event: 'content/page.scheduled' }])
    // Duplicate sends of the same schedule must not start a second sleeper.
    expect(options?.['idempotency']).toContain('event.data.scheduledFor')
  })

  it('sleeps until the scheduled time, then publishes through the injected pipeline', async () => {
    const at = '2026-04-23T09:00:00.000Z'
    const { fakeInngest, publish, run } = setup([{ id: 'p1', scheduledPublishAt: at }])

    const result = await run(scheduled(at))

    expect(fakeInngest.sleeps).toEqual([{ name: 'wait-until-due', until: new Date(at) }])
    expect(publish).toHaveBeenCalledWith(
      {
        collection: 'posts',
        id: 'p1',
        reasoning: 'Scheduled publish executed at its scheduled time',
      },
      { payload: expect.anything() },
    )
    expect(result.outcome).toBe('published')
  })

  /*
  The document is the source of truth and the event is only a wake-up call. A
  reschedule, a cancellation, or a publish or unpublish in the meantime all
  change the stored time, and every one of them must stop this run publishing.
  */
  it.each([
    ['rescheduled', { id: 'p1', scheduledPublishAt: '2026-04-24T09:00:00.000Z' }],
    ['cancelled, or cleared by a publish', { id: 'p1', scheduledPublishAt: null }],
  ])('does not publish a schedule that was %s', async (_label, doc) => {
    const { publish, run } = setup([doc])
    const result = await run(scheduled('2026-04-23T09:00:00.000Z'))
    expect(publish).not.toHaveBeenCalled()
    expect(result.outcome).toBe('superseded')
  })

  it('does not publish a document that no longer exists', async () => {
    const { publish, run } = setup([])
    const result = await run(scheduled('2026-04-23T09:00:00.000Z'))
    expect(publish).not.toHaveBeenCalled()
    expect(result.outcome).toBe('superseded')
  })

  it('compares instants, not strings', async () => {
    // Postgres hands back milliseconds; the event may not carry them.
    const { publish, run } = setup([{ id: 'p1', scheduledPublishAt: '2026-04-23T09:00:00.000Z' }])
    await run(scheduled('2026-04-23T09:00:00Z'))
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('reads the latest version, where a draft save puts the schedule', async () => {
    const at = '2026-04-23T09:00:00.000Z'
    const { payloadHandle, run } = setup([{ id: 'p1', scheduledPublishAt: at }])
    await run(scheduled(at))
    expect(payloadHandle.findByIds[0]).toMatchObject({ collection: 'posts', id: 'p1', draft: true })
  })

  /*
  Inngest's free plan caps a single sleep at seven days and a run at thirty. A
  schedule further out than one six-day hop sleeps the hop, then re-sends its
  own event and ends, so each leg is a fresh run.
  */
  it('relays a schedule further out than one hop instead of sleeping past the cap', async () => {
    const at = '2026-05-20T09:00:00.000Z'
    const { fakeInngest, publish, run } = setup([{ id: 'p1', scheduledPublishAt: at }])

    const result = await run(scheduled(at))

    expect(fakeInngest.sleeps).toEqual([{ name: 'wait-one-hop', until: new Date(NOW + 6 * DAY) }])
    expect(fakeInngest.sends).toEqual([
      { name: 'content/page.scheduled', data: { collection: 'posts', id: 'p1', scheduledFor: at } },
    ])
    expect(publish).not.toHaveBeenCalled()
    expect(result.outcome).toBe('relayed')
  })

  it('does not relay a far schedule that was cancelled during the hop', async () => {
    const { fakeInngest, run } = setup([{ id: 'p1', scheduledPublishAt: null }])
    const result = await run(scheduled('2026-05-20T09:00:00.000Z'))
    expect(fakeInngest.sends).toEqual([])
    expect(result.outcome).toBe('superseded')
  })

  /*
  The hop decision is measured from the event's timestamp. Inngest replays the
  handler after every step, and a decision read off the clock would flip from
  the relay branch to the direct one partway through a run.
  */
  it('decides between hop and direct sleep from the event timestamp, not the clock', async () => {
    const at = '2026-04-29T09:00:00.000Z' // 6d21h after the event
    const { fakeInngest, run } = setup([{ id: 'p1', scheduledPublishAt: at }])
    vi.setSystemTime(new Date(NOW + 5 * DAY)) // a replay, five days in
    await run(scheduled(at))
    expect(fakeInngest.sleeps[0]?.name).toBe('wait-one-hop')
  })

  it('logs a policy refusal and does not throw, so it is not retried', async () => {
    const at = '2026-04-23T09:00:00.000Z'
    const publish = vi.fn(async () => ({ published: false, reason: 'missing alt text' }))
    const { run } = setup([{ id: 'p1', scheduledPublishAt: at }], publish)
    await expect(run(scheduled(at))).resolves.toEqual({
      outcome: 'blocked',
      reason: 'missing alt text',
    })
  })

  it('survives a publish that throws', async () => {
    const at = '2026-04-23T09:00:00.000Z'
    const publish = vi.fn(async () => {
      throw new Error('service not attached')
    })
    const { run } = setup([{ id: 'p1', scheduledPublishAt: at }], publish)
    await expect(run(scheduled(at))).resolves.toEqual({
      outcome: 'error',
      reason: 'service not attached',
    })
  })

  it('ignores a collection it was not given, and a malformed event', async () => {
    const { publish, run } = setup([{ id: 'p1', scheduledPublishAt: '2026-04-23T09:00:00.000Z' }])
    await run(scheduled('2026-04-23T09:00:00.000Z', 'p1', 'pages'))
    await run(scheduled('not a date'))
    expect(publish).not.toHaveBeenCalled()
  })

  it('never writes to Payload itself', async () => {
    const at = '2026-04-23T09:00:00.000Z'
    const { payloadHandle, run } = setup([{ id: 'p1', scheduledPublishAt: at }])
    await run(scheduled(at))
    expect(payloadHandle.updates).toEqual([])
  })
})

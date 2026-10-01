import { describe, expect, it, vi } from 'vitest'
import { createFakeInngest, createFakePayload } from '../_test-helpers.js'
import { createPublishAtScheduledTimeFunction } from '../publish-at-scheduled-time.js'
import { defineJob } from './define.js'
import { inngestFunctionConfig, inngestIdempotency, inngestJobs } from './inngest.js'

/*
What moving a function onto `inngestJobs` must not change.

Inngest keys a function's run history, its in-flight sleeps and its
idempotency window on what the function is registered with. So the assertions
that matter most here are the ones comparing the registered config with what a
hand-written `createFunction` has today: an id or an idempotency string that
drifted would orphan a scheduled publish already sleeping in production, and
nothing would say so.
*/

const noop = async () => undefined

describe('inngestIdempotency', () => {
  it("reproduces publish-at-scheduled-time's expression exactly", () => {
    expect(inngestIdempotency({ fields: ['collection', 'id', 'scheduledFor'] })).toBe(
      'event.data.collection + ":" + event.data.id + ":" + event.data.scheduledFor',
    )
  })

  it("reproduces forumone-2026's narration expression, with its own separator", () => {
    expect(inngestIdempotency({ fields: ['collection', 'id'], separator: '/' })).toBe(
      'event.data.collection + "/" + event.data.id',
    )
  })

  it('is the bare field for one field', () => {
    expect(inngestIdempotency({ fields: ['id'] })).toBe('event.data.id')
  })
})

describe('inngestFunctionConfig', () => {
  it('registers what a hand-written createFunction did, and no more', () => {
    const job = defineJob(
      {
        id: 'publish-at-scheduled-time',
        on: { event: 'content/schedule.requested' },
        concurrency: 1,
        idempotency: { fields: ['collection', 'id', 'scheduledFor'] },
      },
      noop,
    )
    expect(inngestFunctionConfig(job)).toEqual({
      id: 'publish-at-scheduled-time',
      concurrency: 1,
      idempotency: 'event.data.collection + ":" + event.data.id + ":" + event.data.scheduledFor',
      triggers: [{ event: 'content/schedule.requested' }],
    })
  })

  it('matches what createPublishAtScheduledTimeFunction registers today', () => {
    /*
    Against the real factory rather than a copy of its config. This is the
    function with runs sleeping in production, for up to six days at a time,
    so when it moves onto `defineJob` its registration must not change by a
    character.
    */
    const fake = createFakeInngest()
    const onTerminalFailure = vi.fn()
    createPublishAtScheduledTimeFunction({
      inngest: fake.inngest,
      payload: createFakePayload([]).payload,
      collections: [{ slug: 'posts' }],
      publish: vi.fn(),
      onTerminalFailure,
    })
    const job = defineJob(
      {
        id: 'publish-at-scheduled-time',
        on: { event: 'content/page.scheduled' },
        idempotency: { fields: ['collection', 'id', 'scheduledFor'] },
        onFailure: onTerminalFailure,
      },
      noop,
    )
    expect(inngestFunctionConfig(job)).toEqual(fake.functions[0]?.options)
  })

  it('omits every option the job does not set, rather than sending undefined', () => {
    const config = inngestFunctionConfig(
      defineJob({ id: 'nightly', on: { cron: '0 2 * * *' } }, noop),
    )
    expect(config).toEqual({ id: 'nightly', triggers: [{ cron: '0 2 * * *' }] })
    expect(Object.keys(config)).toEqual(['id', 'triggers'])
  })

  it("uses the adapter's failure handler, unless the job names its own", () => {
    const adapterHandler = vi.fn()
    const jobHandler = vi.fn()
    const plain = defineJob({ id: 'a', on: { event: 'x' } }, noop)
    const own = defineJob({ id: 'b', on: { event: 'x' }, onFailure: jobHandler }, noop)

    expect(inngestFunctionConfig(plain, { onFailure: adapterHandler }).onFailure).toBe(
      adapterHandler,
    )
    expect(inngestFunctionConfig(own, { onFailure: adapterHandler }).onFailure).toBe(jobHandler)
  })

  it('keeps retries of 0, which is a decision rather than an absence', () => {
    expect(
      inngestFunctionConfig(defineJob({ id: 'a', on: { event: 'x' }, retries: 0 }, noop)),
    ).toMatchObject({
      retries: 0,
    })
  })
})

describe('inngestJobs', () => {
  it('runs the handler with the event, its timestamp, and the durable steps', async () => {
    const fake = createFakeInngest()
    const seen: unknown[] = []
    const job = defineJob<{ id: string }>(
      { id: 'relay', on: { event: 'thing/happened' } },
      async ({ event, step }) => {
        seen.push(event)
        const doubled = await step.run('double', () => 21 * 2)
        await step.sleepUntil('wait', new Date('2026-10-02T00:00:00Z'))
        await step.sendEvent('relay', {
          name: 'thing/relayed',
          data: { id: event.data.id, doubled },
        })
        return doubled
      },
    )

    inngestJobs(fake.inngest).functions([job])
    const result = await fake.invoke('relay', {
      name: 'thing/happened',
      data: { id: '7' },
      ts: 1_700_000_000_000,
    })

    expect(result).toBe(42)
    expect(seen).toEqual([{ name: 'thing/happened', data: { id: '7' }, ts: 1_700_000_000_000 }])
    expect(fake.sleeps).toEqual([{ name: 'wait', until: new Date('2026-10-02T00:00:00Z') }])
    expect(fake.sends).toEqual([{ name: 'thing/relayed', data: { id: '7', doubled: 42 } }])
  })

  it('registers each job under its own id, in order', () => {
    const fake = createFakeInngest()
    inngestJobs(fake.inngest).functions([
      defineJob({ id: 'first', on: { event: 'a' } }, noop),
      defineJob({ id: 'second', on: { cron: '* * * * *' } }, noop),
    ])
    expect(fake.functions.map((fn) => fn.id)).toEqual(['first', 'second'])
  })

  it('refuses two jobs with one id, which Inngest would treat as one function', () => {
    const fake = createFakeInngest()
    expect(() =>
      inngestJobs(fake.inngest).functions([
        defineJob({ id: 'same', on: { event: 'a' } }, noop),
        defineJob({ id: 'same', on: { event: 'b' } }, noop),
      ]),
    ).toThrow(/share the id "same"/)
  })

  it('emits through the client, one event or several', async () => {
    const fake = createFakeInngest()
    const jobs = inngestJobs(fake.inngest)
    await jobs.emit({ name: 'one', data: 1 })
    await jobs.emit([
      { name: 'two', data: 2 },
      { name: 'three', data: 3 },
    ])
    expect(fake.sends.map((sent) => sent.name)).toEqual(['one', 'two', 'three'])
    expect(jobs.runner).toBe('inngest')
  })
})

describe('defineJob', () => {
  it('refuses what a runner would reject or misread', () => {
    expect(() => defineJob({ id: '', on: { event: 'x' } }, noop)).toThrow(/non-empty id/)
    expect(() => defineJob({ id: ' padded', on: { event: 'x' } }, noop)).toThrow(/non-empty id/)
    expect(() => defineJob({ id: 'a', on: {} as never }, noop)).toThrow(/exactly one/)
    expect(() =>
      defineJob({ id: 'a', on: { event: 'x', cron: '* * * * *' } as never }, noop),
    ).toThrow(/exactly one/)
    expect(() =>
      defineJob({ id: 'a', on: { event: 'x' }, idempotency: { fields: [] } }, noop),
    ).toThrow(/no fields/)
    expect(() => defineJob({ id: 'a', on: { event: 'x' }, retries: 1.5 }, noop)).toThrow(
      /whole number/,
    )
  })

  it('freezes the job, so an adapter cannot be handed one that changed after it registered', () => {
    const job = defineJob({ id: 'a', on: { event: 'x' } }, noop)
    expect(Object.isFrozen(job)).toBe(true)
  })
})

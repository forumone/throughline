import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { auditEventEchoJob } from '../audit-event-echo.js'
import { defineJob } from './define.js'
import { payloadJobs } from './payload.js'

/*
`payloadJobs` against a real Payload and a real database, running jobs through
Payload's own queue. Payload's job runner is the thing being adapted to, so a
fake of it would only test our idea of it: when an inline task is memoized,
when a retry is final, what `waitUntil` holds back.

`:memory:` is private to this file's client; see the publishing integration
suites for why `cache=shared` is not used.
*/

const counts = { beforeSleep: 0, afterSleep: 0, failing: 0, relayed: 0 }
const received: unknown[] = []
const onFailure = vi.fn()

const jobs = payloadJobs({ queue: 'test', onFailure })

const greet = defineJob<{ who: string }>(
  { id: 'greet', on: { event: 'test/greet' } },
  async ({ event, step }) => {
    received.push(event.data)
    return step.run('shout', () => event.data.who.toUpperCase())
  },
)

const once = defineJob<{ id: string }>(
  { id: 'once', on: { event: 'test/once' }, idempotency: { fields: ['id'] } },
  async ({ event }) => {
    received.push({ once: event.data.id })
  },
)

const sleeper = defineJob<{ until: string }>(
  { id: 'sleeper', on: { event: 'test/sleep' } },
  async ({ event, step }) => {
    await step.run('before', () => {
      counts.beforeSleep += 1
      return true
    })
    await step.sleepUntil('nap', new Date(event.data.until))
    await step.run('after', () => {
      counts.afterSleep += 1
      return true
    })
  },
)

const relay = defineJob({ id: 'relay', on: { event: 'test/relay' } }, async ({ step }) => {
  await step.sendEvent('pass-on', { name: 'test/relayed', data: {} })
})

const relayed = defineJob({ id: 'relayed', on: { event: 'test/relayed' } }, async () => {
  counts.relayed += 1
})

const failing = defineJob({ id: 'failing', on: { event: 'test/fail' }, retries: 1 }, async () => {
  counts.failing += 1
  throw new Error('always')
})

/*
A ported workflow, run here rather than on Inngest: the audit echo sends from
inside its steps through the context's emit, which on this adapter queues the
subscriber.
*/
const echoed: unknown[] = []
const approvalRequests = defineJob<{ approvalId: string }>(
  { id: 'approval-requests', on: { event: 'notification/send-approval-request' } },
  async ({ event }) => {
    echoed.push(event.data)
  },
)

const nightly = defineJob(
  { id: 'nightly', on: { cron: '0 2 * * *' }, concurrency: 1 },
  async () => undefined,
)

let payload: Payload

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'integration-secret-integration-secret',
    db: sqliteAdapter({ client: { url: ':memory:' } }),
    collections: [],
    plugins: [
      jobs.plugin([
        greet,
        once,
        sleeper,
        relay,
        relayed,
        failing,
        nightly,
        auditEventEchoJob({}),
        approvalRequests,
      ]),
    ],
    // Not `outputFile: '/dev/null'`, which still forks `payload generate:types`
    // in the background, where it hangs and outlives the run.
    typescript: { autoGenerate: false },
    logger: { options: { level: 'silent' } },
  })
  payload = await getPayload({ config })
}, 60_000)

afterAll(async () => {
  await payload?.destroy?.()
})

const runQueue = () => payload.jobs.run({ queue: 'test', overrideAccess: true })

async function jobsOf(workflow: string) {
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where: { workflowSlug: { equals: workflow } },
    depth: 0,
    overrideAccess: true,
  })
  return docs
}

describe('payloadJobs', () => {
  it('queues a job for its event, and runs it with the event and its steps', async () => {
    await jobs.emit({ name: 'test/greet', data: { who: 'ada' } })
    await runQueue()

    expect(received).toContainEqual({ who: 'ada' })
    // Payload deletes a completed job by default, so a finished job leaves nothing behind.
    expect(await jobsOf('greet')).toEqual([])
  })

  it('queues one job for an idempotency key, however many times the event is sent', async () => {
    await jobs.emit({ name: 'test/once', data: { id: 'a' } })
    await jobs.emit({ name: 'test/once', data: { id: 'a' } })
    await jobs.emit({ name: 'test/once', data: { id: 'b' } })

    expect(await jobsOf('once')).toHaveLength(2)
  })

  it('still declines a duplicate after the first job has run and been deleted', async () => {
    await runQueue()
    await jobs.emit({ name: 'test/once', data: { id: 'a' } })
    expect(await jobsOf('once')).toHaveLength(0)
    expect(received.filter((entry) => (entry as { once?: string }).once === 'a')).toHaveLength(1)
  })

  it('sleeps by ending the job and resuming in a continuation, without re-running a step', async () => {
    await jobs.emit({
      name: 'test/sleep',
      data: { until: new Date(Date.now() + 1500).toISOString() },
    })
    await runQueue()

    expect(counts).toMatchObject({ beforeSleep: 1, afterSleep: 0 })
    const pending = (await jobsOf('sleeper')).filter((job) => !job.completedAt)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.waitUntil).toBeTruthy()

    // Held back until its time, then resumed past the sleep.
    await runQueue()
    expect(counts.afterSleep).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, 1600))
    await runQueue()

    expect(counts).toMatchObject({ beforeSleep: 1, afterSleep: 1 })
  })

  it('treats a sleep until a time already past as no sleep', async () => {
    const before = counts.afterSleep
    await jobs.emit({
      name: 'test/sleep',
      data: { until: new Date(Date.now() - 1000).toISOString() },
    })
    await runQueue()
    expect(counts.afterSleep).toBe(before + 1)
  })

  it('delivers a step.sendEvent to the jobs that subscribe to it', async () => {
    await jobs.emit({ name: 'test/relay', data: {} })
    await runQueue()
    await runQueue()
    expect(counts.relayed).toBe(1)
  })

  it('retries, then calls onFailure once, on the final attempt', async () => {
    await jobs.emit({ name: 'test/fail', data: {} })
    for (let attempt = 0; attempt < 4; attempt += 1) await runQueue()

    expect(counts.failing).toBe(2)
    expect(onFailure).toHaveBeenCalledTimes(1)
    const [args] = onFailure.mock.calls[0] as [
      { error: Error; event: { data: { function_id: string } } },
    ]
    expect(args.error.message).toBe('always')
    expect(args.event.data.function_id).toBe('failing')
  })

  it('runs a ported workflow, whose in-step sends reach their subscribers', async () => {
    await jobs.emit({
      name: 'audit/event.recorded',
      data: { action: 'approval.requested', approvalRequestId: 'ap-1' },
    })
    await runQueue()
    await runQueue()
    expect(echoed).toEqual([{ approvalId: 'ap-1' }])
  })

  it('registers a cron job on its schedule, and turns on concurrency control for it', () => {
    const workflow = payload.config.jobs.workflows?.find(
      (candidate) => candidate.slug === 'nightly',
    )
    expect(workflow?.schedule).toEqual([{ cron: '0 2 * * *', queue: 'test' }])
    expect(workflow?.concurrency).toBeTruthy()
    expect(payload.config.jobs.enableConcurrencyControl).toBe(true)
  })

  it('refuses to emit before Payload has initialised', async () => {
    await expect(payloadJobs().emit({ name: 'x', data: {} })).rejects.toThrow(
      /before Payload initialised/,
    )
  })
})

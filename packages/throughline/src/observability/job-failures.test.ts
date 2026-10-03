import { describe, expect, it, vi } from 'vitest'
import type { CollectionConfig, Config, Field, Payload } from 'payload'
import type { Logger } from '../plugin-contract/index.js'
import {
  DEFAULT_JOB_FAILURES_SLUG,
  JOB_FAILURE_KINDS,
  createJobFailuresCollection,
} from './collection.js'
import { createJobFailureWriter } from './writer.js'
import { getJobFailureWriter, jobFailuresPlugin } from './plugin.js'
import { buildHealthcheckFailureReport, buildJobFailureReport } from './report.js'

const deployment = { environment: 'production', commit: 'abc123' }

function logger(): Logger & { error: ReturnType<typeof vi.fn> } {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function fieldNamed(collection: CollectionConfig, name: string): Field & Record<string, unknown> {
  const field = collection.fields.find((f) => 'name' in f && f.name === name)
  if (!field) throw new Error(`no field ${name}`)
  return field as Field & Record<string, unknown>
}

/**
 * The checks Payload applies to a create that matter here: every required
 * field present, and a select's value among its options. An out-of-enum value
 * is exactly how a non-MCP write to the audit log disappears, so this asserts
 * the writer's row would be accepted by the collection it writes to.
 */
function validate(collection: CollectionConfig, data: Record<string, unknown>): string[] {
  const problems: string[] = []
  for (const field of collection.fields) {
    if (!('name' in field)) continue
    const value = data[field.name]
    if ('required' in field && field.required && (value === undefined || value === '')) {
      problems.push(`${field.name} is required`)
    }
    if (field.type === 'select' && value !== undefined) {
      const allowed = field.options.map((o) => (typeof o === 'string' ? o : o.value))
      if (!allowed.includes(value as string))
        problems.push(`${field.name}: ${String(value)} not allowed`)
    }
    if (field.type === 'text' && value !== undefined && typeof value !== 'string') {
      problems.push(`${field.name} is not text`)
    }
  }
  for (const key of Object.keys(data)) {
    if (!collection.fields.some((f) => 'name' in f && f.name === key))
      problems.push(`${key} is not a field`)
  }
  return problems
}

describe('createJobFailuresCollection', () => {
  it('is read-only from outside the writer, and admin-only to read by default', () => {
    const collection = createJobFailuresCollection()
    expect(collection.slug).toBe(DEFAULT_JOB_FAILURES_SLUG)
    const access = collection.access!
    expect((access.create as () => boolean)()).toBe(false)
    expect((access.update as () => boolean)()).toBe(false)
    expect((access.delete as () => boolean)()).toBe(false)

    const read = access.read as (args: { req: { user: unknown } }) => boolean
    expect(read({ req: { user: { roles: ['admin'] } } })).toBe(true)
    expect(read({ req: { user: { roles: ['editor'] } } })).toBe(false)
    expect(read({ req: { user: null } })).toBe(false)
  })

  it('takes a slug and a read rule', () => {
    const readAccess = () => true
    const collection = createJobFailuresCollection({ slug: 'dead-letters', readAccess })
    expect(collection.slug).toBe('dead-letters')
    expect(collection.access?.read).toBe(readAccess)
  })

  it('declares the kinds it accepts', () => {
    const kind = fieldNamed(createJobFailuresCollection(), 'kind') as {
      options: Array<{ value: string }>
    }
    expect(kind.options.map((o) => o.value)).toEqual([...JOB_FAILURE_KINDS])
  })
})

describe('createJobFailureWriter', () => {
  const collection = createJobFailuresCollection()

  it('writes a job failure as a row the collection accepts — no MCP server required', async () => {
    const create = vi.fn(async () => ({ id: 1 }))
    const write = createJobFailureWriter({ payload: { create } as unknown as Payload })

    await write(
      buildJobFailureReport(
        {
          functionId: 'nightly-import',
          runId: 'run_9',
          triggerEvent: 'inngest/scheduled.timer',
          error: new RangeError('bad date'),
        },
        { deployment },
      ),
    )

    expect(create).toHaveBeenCalledTimes(1)
    const { collection: slug, data } = (
      create.mock.calls[0] as unknown as [{ collection: string; data: Record<string, unknown> }]
    )[0]
    expect(slug).toBe('job-failures')
    expect(data).toMatchObject({
      kind: 'job',
      source: 'nightly-import',
      runId: 'run_9',
      triggerEvent: 'inngest/scheduled.timer',
      message: 'bad date',
      errorName: 'RangeError',
      environment: 'production',
      commit: 'abc123',
      summary: '[production] job: bad date — nightly-import',
    })
    expect(data).not.toHaveProperty('stack')
    expect(data).not.toHaveProperty('mcpServer')
    expect(validate(collection, data)).toEqual([])
  })

  it('writes a healthcheck failure with every failed check in details', async () => {
    const create = vi.fn(async () => ({ id: 1 }))
    const write = createJobFailureWriter({
      payload: { create } as unknown as Payload,
      collectionSlug: 'x',
    })

    await write(
      buildHealthcheckFailureReport([{ name: 'payload', details: 'timeout' }, { name: 'redis' }], {
        deployment,
      }),
    )

    const { collection: slug, data } = (
      create.mock.calls[0] as unknown as [{ collection: string; data: Record<string, unknown> }]
    )[0]
    expect(slug).toBe('x')
    expect(data).toMatchObject({
      kind: 'healthcheck',
      source: 'healthcheck',
      message: '2 check(s) failed: payload, redis',
      details: [{ name: 'payload', details: 'timeout' }, { name: 'redis' }],
    })
    expect(validate(collection, data)).toEqual([])
  })

  it('never throws when the write fails, and logs the failure it could not record', async () => {
    const log = logger()
    const write = createJobFailureWriter({
      payload: {
        create: async () => {
          throw new Error('relation "job_failures" does not exist')
        },
      } as unknown as Payload,
      logger: log,
    })

    await expect(
      write(
        buildJobFailureReport(
          { functionId: 'sync', error: new Error('upstream 503') },
          { deployment },
        ),
      ),
    ).resolves.toBeUndefined()

    expect(log.error).toHaveBeenCalledWith(
      'Job failure write failed',
      expect.objectContaining({
        error: expect.stringContaining('job_failures'),
        summary: '[production] job: upstream 503 — sync',
        message: 'upstream 503',
      }),
    )
  })

  it('never throws even when the logger throws too', async () => {
    const write = createJobFailureWriter({
      payload: { create: async () => Promise.reject(new Error('db')) } as unknown as Payload,
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {
          throw new Error('logger')
        },
      },
    })
    await expect(
      write(buildJobFailureReport({ error: 'x' }, { deployment })),
    ).resolves.toBeUndefined()
  })
})

describe('jobFailuresPlugin', () => {
  const incoming = { db: {}, secret: 'x'.repeat(32), collections: [] } as unknown as Config

  it('adds the collection and attaches a writer at init', async () => {
    const config = (await jobFailuresPlugin({})(incoming)) as Config
    expect(config.collections?.map((c) => c.slug)).toEqual([DEFAULT_JOB_FAILURES_SLUG])

    const create = vi.fn(async () => ({ id: 1 }))
    const payload = { create } as unknown as Payload
    expect(getJobFailureWriter(payload)).toBeUndefined()

    await config.onInit?.(payload)
    const write = getJobFailureWriter(payload)
    expect(typeof write).toBe('function')
    await write?.(buildJobFailureReport({ functionId: 'f', error: new Error('e') }, { deployment }))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: DEFAULT_JOB_FAILURES_SLUG }),
    )
  })

  it('runs an earlier onInit first, and honours a custom slug', async () => {
    const order: string[] = []
    const config = (await jobFailuresPlugin({ slug: 'failures' })({
      ...incoming,
      onInit: async () => {
        order.push('earlier')
      },
    })) as Config
    expect(config.collections?.map((c) => c.slug)).toEqual(['failures'])

    const create = vi.fn(async () => {
      order.push('write')
      return { id: 1 }
    })
    const payload = { create } as unknown as Payload
    await config.onInit?.(payload)
    await getJobFailureWriter(payload)?.(buildJobFailureReport({ error: 'x' }, { deployment }))
    expect(order).toEqual(['earlier', 'write'])
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ collection: 'failures' }))
  })

  it('returns the config untouched when disabled', async () => {
    expect(await jobFailuresPlugin({ enabled: false })(incoming)).toBe(incoming)
  })
})

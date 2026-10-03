import { describe, expect, it, vi } from 'vitest'
import type { Config, Payload } from 'payload'
import { jobFailuresPlugin } from '../observability/plugin.js'
import { type Logger } from '../plugin-contract/index.js'
import { createHealthcheckFailureHandler, createTerminalFailureHandler } from './failure-handler.js'
import { healthcheckJob } from '../integrations/jobs/healthcheck.js'
import { expireStaleApprovalsJob } from '../approvals/jobs/expire-stale-approvals.js'
import { createFakeInngest, createFakePayload, asInngestFunction } from './_test-helpers.js'

function logger(): Logger & { error: ReturnType<typeof vi.fn> } {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

/** Inngest's `function.failed` payload, as much of it as the handler reads. */
const failedEvent = {
  data: {
    function_id: 'expire-stale-approvals',
    run_id: 'run_42',
    event: { name: 'inngest/scheduled.timer' },
  },
}

/** A Payload with `jobFailuresPlugin` initialised on it, recording creates. */
async function payloadWithJobFailures() {
  const create = vi.fn(async () => ({ id: 1 }))
  const payload = { create } as unknown as Payload
  const config = (await jobFailuresPlugin({})({
    db: {},
    secret: 'x'.repeat(32),
  } as unknown as Config)) as Config
  await config.onInit?.(payload)
  return { payload, create }
}

describe('createTerminalFailureHandler', () => {
  it('logs, writes a job-failures row through the plugin, and reports', async () => {
    const { payload, create } = await payloadWithJobFailures()
    const report = vi.fn(async () => {})
    const log = logger()

    await createTerminalFailureHandler({ payload, report, logger: log })({
      error: new Error('collection slug is wrong'),
      event: failedEvent,
    })

    expect(log.error).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[job-failed\] .*job: collection slug is wrong — expire-stale-approvals$/,
      ),
      expect.objectContaining({ report: expect.objectContaining({ runId: 'run_42' }) }),
    )

    expect(create).toHaveBeenCalledTimes(1)
    const { collection, data } = (
      create.mock.calls[0] as unknown as [{ collection: string; data: Record<string, unknown> }]
    )[0]
    expect(collection).toBe('job-failures')
    expect(data).toMatchObject({
      kind: 'job',
      source: 'expire-stale-approvals',
      runId: 'run_42',
      triggerEvent: 'inngest/scheduled.timer',
      message: 'collection slug is wrong',
    })

    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'job',
        functionId: 'expire-stale-approvals',
        stack: expect.stringContaining('collection slug is wrong'),
      }),
    )
  })

  it('still logs and reports with no job-failures plugin registered', async () => {
    const report = vi.fn(async () => {})
    const log = logger()
    const create = vi.fn()

    await createTerminalFailureHandler({
      payload: { create } as unknown as Payload,
      report,
      logger: log,
    })({
      error: new Error('x'),
      event: failedEvent,
    })

    expect(create).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('never throws — not when the writer, the reporter and the logger all do', async () => {
    const handler = createTerminalFailureHandler({
      writer: () => {
        throw new Error('writer broke synchronously')
      },
      report: async () => {
        throw new Error('reporter broke')
      },
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {
          throw new Error('logger broke')
        },
      },
    })

    await expect(
      handler({ error: new Error('original'), event: failedEvent }),
    ).resolves.toBeUndefined()
  })

  it('copes with a failure event that names nothing', async () => {
    const writer = vi.fn(async () => {})
    await createTerminalFailureHandler({ writer, report: false, logger: logger() })({
      error: new Error('x'),
      event: {},
    })
    expect(writer).toHaveBeenCalledWith(expect.objectContaining({ functionId: 'unknown' }))
  })

  it('is what a factory hands Inngest as onFailure', () => {
    const fake = createFakeInngest()
    const onTerminalFailure = createTerminalFailureHandler({ report: false })
    asInngestFunction(expireStaleApprovalsJob, {
      inngest: fake.inngest,
      payload: createFakePayload(),
      onTerminalFailure,
    })
    expect(fake.functions[0]?.options['onFailure']).toBe(onTerminalFailure)
  })
})

describe('createHealthcheckFailureHandler', () => {
  it('records and reports every failing check, once', async () => {
    const { payload, create } = await payloadWithJobFailures()
    const report = vi.fn(async () => {})

    await createHealthcheckFailureHandler({
      payload,
      report,
      logger: logger(),
      functionId: 'site-health',
    })([{ name: 'payload', details: 'timeout' }, { name: 'manifest' }])

    const { data } = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0]
    expect(data).toMatchObject({
      kind: 'healthcheck',
      source: 'site-health',
      details: [{ name: 'payload', details: 'timeout' }, { name: 'manifest' }],
    })
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'healthcheck', functionId: 'site-health' }),
    )
  })

  it('runs from inside the healthcheck function when a check fails', async () => {
    const fake = createFakeInngest()
    const writer = vi.fn(async () => {})
    asInngestFunction(healthcheckJob, {
      inngest: fake.inngest,
      payload: createFakePayload(),
      checks: [{ name: 'always-down', run: async () => ({ ok: false, details: 'down' }) }],
      onFailure: createHealthcheckFailureHandler({ writer, report: false, logger: logger() }),
    })

    await fake.invoke('healthcheck', { name: 'inngest/scheduled.timer', data: {} })
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'healthcheck',
        failed: [{ name: 'always-down', details: 'down' }],
      }),
    )
  })
})

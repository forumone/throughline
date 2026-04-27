import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createHealthcheckFunction,
  createManifestReachableCheck,
  createPayloadReachableCheck,
} from './healthcheck.js'
import { createFakeInngest, createFakePayload } from './_test-helpers.js'

describe('createHealthcheckFunction', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers the configured cron schedule', () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    createHealthcheckFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      checks: [],
      schedule: '*/30 * * * *',
    })
    const triggers = fakeInngest.functions[0]?.options['triggers'] as Array<{ cron: string }>
    expect(triggers).toEqual([{ cron: '*/30 * * * *' }])
  })

  it('runs every check, calls onFailure on at-least-one failure, fires heartbeat', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    const onFailure = vi.fn(async () => {})
    createHealthcheckFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      onFailure,
      checks: [
        { name: 'a', run: async () => ({ ok: true }) },
        { name: 'b', run: async () => ({ ok: false, details: 'broken' }) },
      ],
    })
    const result = (await fakeInngest.invoke('healthcheck', {
      name: 'inngest/function.invoked',
      data: {},
    })) as { failureCount: number }
    expect(result.failureCount).toBe(1)
    expect(onFailure).toHaveBeenCalledWith([{ name: 'b', details: 'broken' }])
    expect(fakeInngest.sends).toEqual([
      expect.objectContaining({ name: 'system/healthcheck' }),
    ])
  })

  it('catches thrown errors inside checks', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    const onFailure = vi.fn(async () => {})
    createHealthcheckFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      onFailure,
      checks: [
        {
          name: 'crashes',
          run: async () => {
            throw new Error('boom')
          },
        },
      ],
    })
    await fakeInngest.invoke('healthcheck', { name: 'inngest/function.invoked', data: {} })
    expect(onFailure).toHaveBeenCalledWith([{ name: 'crashes', details: 'boom' }])
  })

  it('skips onFailure when all checks pass and still fires heartbeat', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    const onFailure = vi.fn(async () => {})
    createHealthcheckFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      onFailure,
      checks: [{ name: 'a', run: async () => ({ ok: true }) }],
    })
    await fakeInngest.invoke('healthcheck', { name: 'inngest/function.invoked', data: {} })
    expect(onFailure).not.toHaveBeenCalled()
    expect(fakeInngest.sends.find((e) => e.name === 'system/healthcheck')).toBeDefined()
  })
})

describe('createPayloadReachableCheck', () => {
  it('returns ok when payload.find succeeds', async () => {
    const payloadHandle = createFakePayload([{ id: '1' }])
    const check = createPayloadReachableCheck()
    const result = await check.run({ payload: payloadHandle.payload })
    expect(result).toEqual({ ok: true })
  })

  it('returns not-ok with the error message on failure', async () => {
    const failingPayload = {
      find: async () => {
        throw new Error('connection refused')
      },
    } as unknown as Parameters<ReturnType<typeof createPayloadReachableCheck>['run']>[0]['payload']
    const check = createPayloadReachableCheck()
    const result = await check.run({ payload: failingPayload })
    expect(result.ok).toBe(false)
    expect(result.details).toBe('connection refused')
  })
})

describe('createManifestReachableCheck', () => {
  it('returns ok on 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('manifest', { status: 200 })),
    )
    const check = createManifestReachableCheck('https://example.com/m.json')
    const result = await check.run({ payload: {} as never })
    expect(result).toEqual({ ok: true })
  })

  it('returns not-ok with HTTP status on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    const check = createManifestReachableCheck('https://example.com/m.json')
    const result = await check.run({ payload: {} as never })
    expect(result).toEqual({ ok: false, details: 'HTTP 503' })
  })

  it('returns not-ok with error.message on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const check = createManifestReachableCheck('https://example.com/m.json')
    const result = await check.run({ payload: {} as never })
    expect(result).toEqual({ ok: false, details: 'network down' })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@forumone/throughline-plugin-contract'
import {
  buildHealthcheckFailureReport,
  buildJobFailureReport,
  buildRequestErrorReport,
  clientPrefix,
  createErrorReporter,
  currentDeployment,
  describeErrorReporting,
  summariseReport,
} from './report.js'

const now = new Date('2026-09-30T12:00:00.000Z')
const deployment = { environment: 'production', commit: 'abc123' }

function quietLogger(): Logger & { warn: ReturnType<typeof vi.fn> } {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

describe('buildRequestErrorReport', () => {
  const headers = {
    cookie: 'payload-token=secret-jwt',
    authorization: 'Bearer secret',
    'x-api-key': 'secret',
    'user-agent': 'Mozilla/5.0',
    referer: 'https://example.com/from',
    'x-vercel-id': 'iad1::abc',
    'x-forwarded-for': '203.0.113.42, 10.0.0.1',
    'x-custom': 'not on the list',
  }

  it('copies only the allowlisted headers, and the client address as a prefix', () => {
    const report = buildRequestErrorReport(
      new Error('boom'),
      { path: '/about', method: 'GET', headers },
      {},
      { deployment, now },
    )

    expect(report.request.headers).toEqual({
      'x-vercel-id': 'iad1::abc',
      'user-agent': 'Mozilla/5.0',
      referer: 'https://example.com/from',
    })
    expect(report.request.clientPrefix).toBe('203.0.0.0/16')
    expect(JSON.stringify(report)).not.toContain('secret')
    expect(JSON.stringify(report)).not.toContain('203.0.113.42')
  })

  it('never copies a credential header, even when a caller lists it', () => {
    const report = buildRequestErrorReport(
      new Error('boom'),
      { path: '/', method: 'GET', headers },
      {},
      {
        headers: ['Cookie', 'authorization', 'x-api-key', 'x-forwarded-for', 'x-custom'],
        deployment,
      },
    )
    expect(report.request.headers).toEqual({ 'x-custom': 'not on the list' })
  })

  it('reads a Fetch Headers object as well as a record', () => {
    const report = buildRequestErrorReport(
      new Error('boom'),
      { path: '/', method: 'POST', headers: new Headers({ 'User-Agent': 'bot', Cookie: 'x=1' }) },
      {},
      { deployment },
    )
    expect(report.request.headers).toEqual({ 'user-agent': 'bot' })
  })

  it('carries the digest and route context, and copes with a non-Error', () => {
    const report = buildRequestErrorReport(
      { message: 'rsc failed', digest: '12345' },
      { path: '/x', method: 'GET', headers: {} },
      { routePath: '/[slug]', routeType: 'render', unrelated: 1 },
      { deployment, now },
    )
    expect(report).toMatchObject({
      kind: 'request',
      at: now.toISOString(),
      message: 'rsc failed',
      digest: '12345',
      context: { routePath: '/[slug]', routeType: 'render' },
    })
    expect(report.context).not.toHaveProperty('unrelated')
  })
})

describe('clientPrefix', () => {
  it('reduces IPv4 to a /16 and IPv6 to a /64', () => {
    expect(clientPrefix('198.51.100.7')).toBe('198.51.0.0/16')
    expect(clientPrefix('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64')
    expect(clientPrefix(undefined)).toBeUndefined()
    expect(clientPrefix('garbage')).toBeUndefined()
  })
})

describe('buildJobFailureReport', () => {
  it('names the function, the run and the trigger', () => {
    const error = new TypeError('slug is wrong')
    const report = buildJobFailureReport(
      {
        functionId: 'expire-stale-approvals',
        runId: 'run_1',
        triggerEvent: 'inngest/scheduled.timer',
        error,
      },
      { deployment, now },
    )
    expect(report).toMatchObject({
      kind: 'job',
      functionId: 'expire-stale-approvals',
      runId: 'run_1',
      triggerEvent: 'inngest/scheduled.timer',
      message: 'slug is wrong',
      name: 'TypeError',
      deployment,
    })
    expect(report.stack).toContain('slug is wrong')
  })

  it("reports an unnamed function as 'unknown' rather than dropping it", () => {
    const report = buildJobFailureReport({ error: 'a string' }, { deployment })
    expect(report.functionId).toBe('unknown')
    expect(report.message).toBe('a string')
    expect(report).not.toHaveProperty('runId')
  })
})

describe('currentDeployment', () => {
  it('prefers VERCEL_ENV over NODE_ENV and shortens the commit', () => {
    expect(
      currentDeployment({
        NODE_ENV: 'production',
        VERCEL_ENV: 'preview',
        VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
      }),
    ).toEqual({ environment: 'preview', commit: 'a'.repeat(12) })
    expect(currentDeployment({ NODE_ENV: 'development' })).toEqual({ environment: 'development' })
  })
})

describe('summariseReport', () => {
  it('leads with the environment and names where it happened', () => {
    const job = buildJobFailureReport(
      { functionId: 'sync', error: new Error('down') },
      { deployment },
    )
    expect(summariseReport(job)).toBe('[production] job: down — sync')

    const request = buildRequestErrorReport(
      new Error('500'),
      { path: '/a', method: 'POST', headers: {} },
      {},
      { deployment },
    )
    expect(summariseReport(request)).toBe('[production] request: 500 — POST /a')

    const health = buildHealthcheckFailureReport([{ name: 'payload' }, { name: 'manifest' }], {
      deployment,
    })
    expect(summariseReport(health)).toBe(
      '[production] healthcheck: failing: payload, manifest — healthcheck',
    )
  })

  it('does not throw on something that is not a report', () => {
    expect(summariseReport(null)).toBe('[unknown environment] error: no message')
  })
})

describe('describeErrorReporting', () => {
  it('says off, on, or misconfigured', () => {
    expect(describeErrorReporting('')).toMatch(/OFF/)
    expect(describeErrorReporting('https://hooks.example.com/abc')).toBe(
      'error reporting: on, to hooks.example.com',
    )
    expect(describeErrorReporting('not a url')).toMatch(/MISCONFIGURED/)
  })
})

describe('createErrorReporter', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('POSTs the report as JSON with a text summary and the webhook headers', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    const report = createErrorReporter({
      url: 'https://hooks.example.com/x',
      webhookHeaders: { authorization: 'Bearer receiver-token' },
      fetch: fetchMock as unknown as typeof fetch,
    })
    const job = buildJobFailureReport({ functionId: 'f', error: new Error('e') }, { deployment })

    await report(job)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://hooks.example.com/x')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      authorization: 'Bearer receiver-token',
      'content-type': 'application/json',
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body['text']).toBe('[production] job: e — f')
    expect(body['functionId']).toBe('f')
  })

  it('reads ERROR_WEBHOOK_URL at call time, and does nothing when it is unset', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    const report = createErrorReporter({ fetch: fetchMock as unknown as typeof fetch })

    vi.stubEnv('ERROR_WEBHOOK_URL', '')
    await report({ message: 'x' })
    expect(fetchMock).not.toHaveBeenCalled()

    vi.stubEnv('ERROR_WEBHOOK_URL', 'https://hooks.example.com/late')
    await report({ message: 'x' })
    expect(fetchMock).toHaveBeenCalledWith('https://hooks.example.com/late', expect.anything())
  })

  it('never throws when the fetch rejects, and logs the failed delivery', async () => {
    const logger = quietLogger()
    const report = createErrorReporter({
      url: 'https://hooks.example.com/x',
      logger,
      fetch: (async () => {
        throw new Error('ECONNREFUSED')
      }) as unknown as typeof fetch,
    })

    await expect(report({ message: 'x' })).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(
      'Error report delivery failed',
      expect.objectContaining({ error: expect.stringContaining('ECONNREFUSED') }),
    )
  })

  it('never throws when the receiver refuses, or the logger itself throws', async () => {
    const throwingLogger: Logger = {
      debug: () => {},
      info: () => {},
      warn: () => {
        throw new Error('logger broke')
      },
      error: () => {},
    }
    const refuse = createErrorReporter({
      url: 'https://hooks.example.com/x',
      logger: throwingLogger,
      fetch: (async () => new Response('no', { status: 400 })) as unknown as typeof fetch,
    })
    await expect(refuse({ message: 'x' })).resolves.toBeUndefined()

    const unserialisable: Record<string, unknown> = {}
    unserialisable['self'] = unserialisable
    await expect(refuse(unserialisable)).resolves.toBeUndefined()
  })

  it('aborts a receiver that hangs, after the timeout', async () => {
    const logger = quietLogger()
    const report = createErrorReporter({
      url: 'https://hooks.example.com/x',
      timeoutMs: 20,
      logger,
      fetch: ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        })) as unknown as typeof fetch,
    })

    await expect(report({ message: 'x' })).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith('Error report delivery failed', expect.anything())
  })

  it('wraps a non-object report rather than dropping it', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    await createErrorReporter({
      url: 'https://h.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    })('plain string')
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toMatchObject({ report: 'plain string' })
  })
})

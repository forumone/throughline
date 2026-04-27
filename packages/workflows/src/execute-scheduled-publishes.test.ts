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
    delete process.env['PUBLISHING_SYSTEM_API_KEY']
  })

  it('throws when no api key is configured', () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    expect(() =>
      createExecuteScheduledPublishesFunction({
        inngest: fakeInngest.inngest,
        payload: payloadHandle.payload,
        collections: [{ slug: 'pages' }],
        publishingServerUrl: 'https://example.com',
      }),
    ).toThrow(/publishingApiKey or the PUBLISHING_SYSTEM_API_KEY/)
  })

  it('falls back to PUBLISHING_SYSTEM_API_KEY env var', () => {
    process.env['PUBLISHING_SYSTEM_API_KEY'] = 'env-key'
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    expect(() =>
      createExecuteScheduledPublishesFunction({
        inngest: fakeInngest.inngest,
        payload: payloadHandle.payload,
        collections: [{ slug: 'pages' }],
        publishingServerUrl: 'https://example.com',
      }),
    ).not.toThrow()
  })

  it('registers a cron trigger with the configured schedule', () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    createExecuteScheduledPublishesFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      collections: [{ slug: 'pages' }],
      publishingServerUrl: 'https://example.com',
      publishingApiKey: 'k',
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
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ result: { content: [{ type: 'text', text: 'ok' }] } }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    createExecuteScheduledPublishesFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      collections: [{ slug: 'pages' }],
      publishingServerUrl: 'https://example.com/',
      publishingApiKey: 'test-key',
    })

    const result = (await fakeInngest.invoke('execute-scheduled-publishes', {
      name: 'inngest/function.invoked',
      data: {},
    })) as { publishedCount: number; blockedCount: number }

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://example.com/api/publishing/mcp')
    expect((init as RequestInit | undefined)?.headers).toMatchObject({
      authorization: 'Bearer test-key',
      'content-type': 'application/json',
    })
    expect(JSON.parse((init as { body: string }).body)).toMatchObject({
      method: 'tools/call',
      params: {
        name: 'publish',
        arguments: { collection: 'pages', id: 'p1' },
      },
    })
    expect(result.publishedCount).toBe(1)
  })

  it('counts policy rejections separately and does not retry', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload([
      { id: 'p1', _status: 'draft', title: 'Past', scheduledPublishAt: '2026-04-22T11:00:00.000Z' },
    ])
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'composition failed: missing hero' } }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    createExecuteScheduledPublishesFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      collections: [{ slug: 'pages' }],
      publishingServerUrl: 'https://example.com',
      publishingApiKey: 'k',
    })

    const result = (await fakeInngest.invoke('execute-scheduled-publishes', {
      name: 'inngest/function.invoked',
      data: {},
    })) as { publishedCount: number; blockedCount: number }
    expect(result.publishedCount).toBe(0)
    expect(result.blockedCount).toBe(1)
  })
})

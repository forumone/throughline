import { describe, expect, it, vi } from 'vitest'
import { APIError, type PayloadRequest, type TypedUser } from 'payload'
import { createAdminEndpoints } from './admin.js'
import { attachPublishingService, type PublishingService } from '../service.js'

const user = { id: 'u-42', email: 'editor@example.com', name: 'Ed' } as unknown as TypedUser

function makeRequest(overrides: {
  user?: TypedUser | null
  body?: unknown
  service?: Partial<PublishingService>
  attachService?: boolean
}): PayloadRequest {
  const payload = {
    logger: { error: vi.fn() },
  } as unknown as Record<string, unknown>

  if (overrides.attachService !== false) {
    attachPublishingService(payload, {
      publish: async () => ({ published: true, publishedAt: '2026-01-01T00:00:00.000Z' }),
      unpublish: async () => ({ unpublished: true }),
      getStatus: async () => ({
        status: 'draft',
        publishable: true,
        publishedAt: null,
        hasUnpublishedChanges: false,
      }),
      ...overrides.service,
    } as PublishingService)
  }

  return {
    user: overrides.user === undefined ? user : overrides.user,
    payload,
    json: async () => overrides.body,
  } as unknown as PayloadRequest
}

function endpoints() {
  return createAdminEndpoints({
    routePrefix: '/publishing',
    publishableSlugs: new Set(['pages']),
  })
}

const publish = () => endpoints()[0]!
const unpublish = () => endpoints()[1]!

describe('createAdminEndpoints', () => {
  it('mounts publish and unpublish under the route prefix', () => {
    const paths = endpoints().map((e) => `${e.method} ${e.path}`)
    expect(paths).toEqual(['post /publishing/publish', 'post /publishing/unpublish'])
  })

  it('rejects an unauthenticated request', async () => {
    const res = await publish().handler(
      makeRequest({ user: null, body: { collection: 'pages', id: '1' } }),
    )
    expect(res.status).toBe(401)
  })

  it('rejects a body without collection and id', async () => {
    const res = await publish().handler(makeRequest({ body: { collection: 'pages' } }))
    expect(res.status).toBe(400)
  })

  it('rejects a collection that is not registered as publishable', async () => {
    const res = await publish().handler(
      makeRequest({ body: { collection: 'posts', id: '1' } }),
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('not registered as publishable'),
    })
  })

  it('returns 503 when the plugin has not finished initializing', async () => {
    const res = await publish().handler(
      makeRequest({ body: { collection: 'pages', id: '1' }, attachService: false }),
    )
    expect(res.status).toBe(503)
  })

  it('publishes as the logged-in user, never with an API key', async () => {
    const publishSpy = vi.fn(async () => ({ published: true }))
    const res = await publish().handler(
      makeRequest({
        body: { collection: 'pages', id: '1' },
        service: { publish: publishSpy as unknown as PublishingService['publish'] },
      }),
    )

    expect(res.status).toBe(200)
    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        id: '1',
        actor: expect.objectContaining({
          enforceAccessAs: user,
          channel: 'admin',
          user: expect.objectContaining({ id: 'u-42' }),
        }),
      }),
    )
    const actor = publishSpy.mock.calls[0]![0].actor as Record<string, unknown>
    expect(actor['apiKeyName']).toBeUndefined()
  })

  it('accepts a numeric document id', async () => {
    const publishSpy = vi.fn(async () => ({ published: true }))
    await publish().handler(
      makeRequest({
        body: { collection: 'pages', id: 7 },
        service: { publish: publishSpy as unknown as PublishingService['publish'] },
      }),
    )
    expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({ id: '7' }))
  })

  // A blocked publish is an answer, not a transport failure — the admin
  // needs the diagnostic body, not an error status it would discard.
  it('returns 200 with the diagnostic when the pipeline blocks', async () => {
    const res = await publish().handler(
      makeRequest({
        body: { collection: 'pages', id: '1' },
        service: {
          publish: async () => ({
            published: false,
            failedAt: 'accessibility',
            reason: 'Two images are missing alt text.',
            issues: [{ message: 'Image 2 has no alt text', severity: 'error' as const }],
            suggestion: 'Add alt text in the Hero block.',
          }),
        },
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      published: false,
      failedAt: 'accessibility',
      suggestion: 'Add alt text in the Hero block.',
    })
  })

  it('forwards a Payload access failure with its own status', async () => {
    const res = await publish().handler(
      makeRequest({
        body: { collection: 'pages', id: '1' },
        service: {
          publish: async () => {
            throw new APIError('You are not allowed to perform this action.', 403)
          },
        },
      }),
    )

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: 'You are not allowed to perform this action.',
    })
  })

  it('does not leak internal error details on an unexpected failure', async () => {
    const res = await publish().handler(
      makeRequest({
        body: { collection: 'pages', id: '1' },
        service: {
          publish: async () => {
            throw new Error('connect ECONNREFUSED 10.0.0.4:5432')
          },
        },
      }),
    )

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).not.toMatch(/ECONNREFUSED/)
  })

  it('unpublishes through the same guard rails', async () => {
    const unpublishSpy = vi.fn(async () => ({ unpublished: true }))
    const res = await unpublish().handler(
      makeRequest({
        body: { collection: 'pages', id: '1' },
        service: { unpublish: unpublishSpy as unknown as PublishingService['unpublish'] },
      }),
    )

    expect(res.status).toBe(200)
    expect(unpublishSpy).toHaveBeenCalledWith(
      expect.objectContaining({ actor: expect.objectContaining({ channel: 'admin' }) }),
    )
  })
})

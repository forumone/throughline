import { describe, expect, it } from 'vitest'
import type { PayloadRequest, TypedUser } from 'payload'
import type { Inngest } from 'inngest'
import { createSyncEndpoint } from './sync.js'

const SLUG = 'integrations'

const admin = { id: 'u-1', email: 'admin@example.com', roles: ['admin'] } as unknown as TypedUser
const editor = { id: 'u-2', email: 'ed@example.com', roles: ['editor'] } as unknown as TypedUser

interface Doc {
  id: string
  name: string
  integrationType: string
  enabled: boolean
  lastSyncAt?: string
}

const instances: Doc[] = [
  {
    id: 'inst-1',
    name: 'Greenhouse',
    integrationType: 'greenhouse',
    enabled: true,
    lastSyncAt: '2026-08-29T10:00:00.000Z',
  },
  { id: 'inst-2', name: 'Webhook', integrationType: 'webhook', enabled: false },
]

function makeRequest(overrides: {
  user?: TypedUser | null
  id?: unknown
  body?: unknown
  send?: () => Promise<void>
}) {
  const sends: Array<{ name: string; data: unknown }> = []
  const errors: string[] = []

  const req = {
    user: overrides.user === undefined ? admin : overrides.user,
    routeParams: { id: 'id' in overrides ? overrides.id : 'inst-1' },
    payload: {
      logger: { error: (message: string) => errors.push(message) },
      findByID: async ({ id }: { id: string }) => {
        const found = instances.find((doc) => doc.id === id)
        if (!found) throw new Error('Not found')
        return found
      },
    },
    json: async () => {
      if (overrides.body === undefined) throw new Error('no body')
      return overrides.body
    },
  } as unknown as PayloadRequest

  const inngest = {
    send: async (event: { name: string; data: unknown }) => {
      if (overrides.send) await overrides.send()
      sends.push(event)
    },
  } as unknown as Inngest

  return { req, inngest, sends, errors }
}

function endpoint(inngest: Inngest) {
  return createSyncEndpoint({ collectionSlug: SLUG, inngest })
}

describe('createSyncEndpoint', () => {
  it('mounts at the collection-relative :id/sync path', () => {
    const { inngest } = makeRequest({})
    const e = endpoint(inngest)
    expect(`${e.method} ${e.path}`).toBe('post /:id/sync')
  })

  it('rejects an unauthenticated request', async () => {
    const { req, inngest, sends } = makeRequest({ user: null })
    const res = await endpoint(inngest).handler(req)
    expect(res.status).toBe(401)
    expect(sends).toHaveLength(0)
  })

  // Same rule as the MCP tool: triggering makes the integration POST outward.
  it('rejects an editor', async () => {
    const { req, inngest, sends } = makeRequest({ user: editor })
    const res = await endpoint(inngest).handler(req)
    expect(res.status).toBe(403)
    expect(sends).toHaveLength(0)
  })

  it('queues the sync as the logged-in admin and answers 202', async () => {
    const { req, inngest, sends } = makeRequest({})
    const res = await endpoint(inngest).handler(req)

    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      triggered: { instanceId: 'inst-1', instanceName: 'Greenhouse', type: 'greenhouse' },
      lastSyncAt: '2026-08-29T10:00:00.000Z',
    })
    expect(sends[0]?.data).toMatchObject({ instanceId: 'inst-1', triggeredBy: 'u-1' })
  })

  // The button sends no reason, and the audit trail should not be poorer for it.
  it('records who triggered it when no reason is given', async () => {
    const { req, inngest, sends } = makeRequest({})
    await endpoint(inngest).handler(req)
    expect((sends[0]?.data as { reason: string }).reason).toContain('admin@example.com')
  })

  it('prefers a reason from the body', async () => {
    const { req, inngest, sends } = makeRequest({ body: { reason: '  checking the pay range  ' } })
    await endpoint(inngest).handler(req)
    expect((sends[0]?.data as { reason: string }).reason).toBe('checking the pay range')
  })

  it('answers 404 for an id that is not an instance', async () => {
    const { req, inngest } = makeRequest({ id: 'nope' })
    const res = await endpoint(inngest).handler(req)
    expect(res.status).toBe(404)
  })

  it('answers 409 for a disabled instance, naming it', async () => {
    const { req, inngest, sends } = makeRequest({ id: 'inst-2' })
    const res = await endpoint(inngest).handler(req)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'disabled' })
    expect(sends).toHaveLength(0)
  })

  it('answers 400 when the path carries no id', async () => {
    const { req, inngest } = makeRequest({ id: undefined })
    const res = await endpoint(inngest).handler(req)
    expect(res.status).toBe(400)
  })

  // An unreachable queue must not read as a button that worked.
  it('answers 502 and logs when Inngest refuses the event', async () => {
    const { req, inngest, errors } = makeRequest({
      send: () => Promise.reject(new Error('ECONNREFUSED')),
    })
    const res = await endpoint(inngest).handler(req)
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({ code: 'send-failed' })
    expect(errors.join('\n')).toMatch(/ECONNREFUSED/)
  })

  it('treats an absent body as no reason rather than a bad request', async () => {
    const { req, inngest } = makeRequest({})
    const res = await endpoint(inngest).handler(req)
    expect(res.status).toBe(202)
  })
})

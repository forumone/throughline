import { describe, expect, it } from 'vitest'
import type { Inngest } from 'inngest'
import type { Payload } from 'payload'
import { createSubmitEndpoint } from './endpoint.js'
import type { ResolvedFormsConfig } from '../options.js'

interface FakePayloadHandle {
  payload: Payload
  finds: Array<{ collection: string; where?: unknown; limit?: number }>
  creates: Array<{ collection: string; data: Record<string, unknown> }>
  setForm: (form: Record<string, unknown> | null) => void
  setSubmissionCount: (count: number) => void
}

function makePayload(initialForm: Record<string, unknown> | null = null): FakePayloadHandle {
  const finds: FakePayloadHandle['finds'] = []
  const creates: FakePayloadHandle['creates'] = []
  let form = initialForm
  let submissionCount = 0
  const payload = {
    findByID: async ({ collection, id }: { collection: string; id: string }) => {
      finds.push({ collection, where: { id } })
      if (collection === 'forms' && form) return { id, ...form }
      return null
    },
    find: async (args: { collection: string; limit?: number }) => {
      finds.push(args)
      return {
        docs: [],
        totalDocs: submissionCount,
        page: 1,
        totalPages: 1,
        limit: args.limit ?? 0,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null,
        pagingCounter: 1,
      }
    },
    create: async (args: { collection: string; data: Record<string, unknown> }) => {
      creates.push(args)
      return { id: `sub-${creates.length}`, ...args.data }
    },
  } as unknown as Payload
  return {
    payload,
    finds,
    creates,
    setForm: (next) => {
      form = next
    },
    setSubmissionCount: (n) => {
      submissionCount = n
    },
  }
}

function makeInngest(): { inngest: Inngest; sends: Array<{ name: string; data: unknown }> } {
  const sends: Array<{ name: string; data: unknown }> = []
  const inngest = {
    send: async (event: { name: string; data: unknown } | Array<{ name: string; data: unknown }>) => {
      const arr = Array.isArray(event) ? event : [event]
      for (const e of arr) sends.push(e)
    },
  } as unknown as Inngest
  return { inngest, sends }
}

function makeResolved(overrides: Partial<ResolvedFormsConfig> = {}): ResolvedFormsConfig {
  const inngestHandle = makeInngest()
  return {
    options: {
      inngest: inngestHandle.inngest,
      ipHashSecret: 'a'.repeat(32),
      allowedDestinations: [
        { type: 'email', value: 'a@b.com', label: 'A', description: 'A' },
      ],
    },
    ipHashSecret: 'a'.repeat(32),
    formsCollectionSlug: 'forms',
    submissionsCollectionSlug: 'form-submissions',
    routePrefix: '/forms',
    rateLimit: 5,
    requireConsentByDefault: true,
    defaultPrivacyNotice: 'notice',
    destinationLabels: ['A'],
    ...overrides,
  }
}

function makeRequest(args: {
  payload: Payload
  body: unknown
  headers?: Record<string, string>
}): { json: () => Promise<unknown>; payload: Payload; headers: Headers } {
  return {
    json: async () => args.body,
    payload: args.payload,
    headers: new Headers(args.headers ?? {}),
  }
}

describe('createSubmitEndpoint', () => {
  it('exposes a POST endpoint at <routePrefix>/submit', () => {
    const endpoint = createSubmitEndpoint(makeResolved())
    expect(endpoint.path).toBe('/forms/submit')
    expect(endpoint.method).toBe('post')
  })

  it('returns 400 for invalid JSON', async () => {
    const endpoint = createSubmitEndpoint(makeResolved())
    const handler = endpoint.handler as unknown as (req: ReturnType<typeof makeRequest>) => Promise<Response>
    const payloadHandle = makePayload()
    const req = makeRequest({ payload: payloadHandle.payload, body: undefined })
    const broken: typeof req = {
      ...req,
      json: async () => {
        throw new Error('not json')
      },
    }
    const res = await handler(broken)
    expect(res.status).toBe(400)
  })

  it('returns 400 when formId is missing', async () => {
    const endpoint = createSubmitEndpoint(makeResolved())
    const handler = endpoint.handler as unknown as (req: ReturnType<typeof makeRequest>) => Promise<Response>
    const payloadHandle = makePayload()
    const res = await handler(makeRequest({ payload: payloadHandle.payload, body: {} }))
    expect(res.status).toBe(400)
  })

  it('silently 200s when the honeypot is filled (do not signal to bots)', async () => {
    const endpoint = createSubmitEndpoint(makeResolved())
    const handler = endpoint.handler as unknown as (req: ReturnType<typeof makeRequest>) => Promise<Response>
    const payloadHandle = makePayload({ title: 'Contact', policy: {} })
    const res = await handler(
      makeRequest({
        payload: payloadHandle.payload,
        body: { formId: 'f-1', _hp: 'gotcha', data: {} },
      }),
    )
    expect(res.status).toBe(200)
    expect(payloadHandle.creates).toHaveLength(0)
  })

  it('returns 404 when the form does not exist', async () => {
    const endpoint = createSubmitEndpoint(makeResolved())
    const handler = endpoint.handler as unknown as (req: ReturnType<typeof makeRequest>) => Promise<Response>
    const payloadHandle = makePayload(null)
    const res = await handler(
      makeRequest({ payload: payloadHandle.payload, body: { formId: 'gone', data: {} } }),
    )
    expect(res.status).toBe(404)
  })

  it('rejects when consent is required but not given', async () => {
    const endpoint = createSubmitEndpoint(makeResolved())
    const handler = endpoint.handler as unknown as (req: ReturnType<typeof makeRequest>) => Promise<Response>
    const payloadHandle = makePayload({
      title: 'Contact',
      policy: { requiresExplicitConsent: true },
    })
    const res = await handler(
      makeRequest({
        payload: payloadHandle.payload,
        body: { formId: 'f-1', data: { name: 'Ada' } },
      }),
    )
    expect(res.status).toBe(400)
    expect(payloadHandle.creates).toHaveLength(0)
  })

  it('rejects when over the rate limit', async () => {
    const endpoint = createSubmitEndpoint(makeResolved({ rateLimit: 1 }))
    const handler = endpoint.handler as unknown as (req: ReturnType<typeof makeRequest>) => Promise<Response>
    const payloadHandle = makePayload({
      title: 'Contact',
      policy: { requiresExplicitConsent: true },
    })
    payloadHandle.setSubmissionCount(1)
    const res = await handler(
      makeRequest({
        payload: payloadHandle.payload,
        body: { formId: 'f-1', consent: true, data: {} },
      }),
    )
    expect(res.status).toBe(429)
  })

  it('persists submission and fires form/submission.received on success', async () => {
    const inngestHandle = makeInngest()
    const resolved = makeResolved()
    resolved.options.inngest = inngestHandle.inngest
    const endpoint = createSubmitEndpoint(resolved)
    const handler = endpoint.handler as unknown as (req: ReturnType<typeof makeRequest>) => Promise<Response>
    const payloadHandle = makePayload({
      title: 'Contact',
      policy: { requiresExplicitConsent: true },
    })

    const res = await handler(
      makeRequest({
        payload: payloadHandle.payload,
        body: { formId: 'f-1', consent: true, data: { name: 'Ada', message: 'Hi' } },
      }),
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean; submissionId: string }
    expect(json.ok).toBe(true)
    expect(json.submissionId).toBe('sub-1')

    expect(payloadHandle.creates).toHaveLength(1)
    expect(payloadHandle.creates[0]?.collection).toBe('form-submissions')
    expect(payloadHandle.creates[0]?.data).toMatchObject({
      form: 'f-1',
      submissionData: [
        { field: 'name', value: 'Ada' },
        { field: 'message', value: 'Hi' },
      ],
    })
    expect(typeof payloadHandle.creates[0]?.data['ipHash']).toBe('string')

    expect(inngestHandle.sends).toEqual([
      {
        name: 'form/submission.received',
        data: { formId: 'f-1', submissionId: 'sub-1', formTitle: 'Contact' },
      },
    ])
  })

  it('honors per-form rate limit override over the plugin default', async () => {
    const endpoint = createSubmitEndpoint(makeResolved({ rateLimit: 100 }))
    const handler = endpoint.handler as unknown as (req: ReturnType<typeof makeRequest>) => Promise<Response>
    const payloadHandle = makePayload({
      title: 'Contact',
      policy: {
        requiresExplicitConsent: true,
        spamProtection: { rateLimit: 1 },
      },
    })
    payloadHandle.setSubmissionCount(1)
    const res = await handler(
      makeRequest({
        payload: payloadHandle.payload,
        body: { formId: 'f-1', consent: true, data: {} },
      }),
    )
    expect(res.status).toBe(429)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmailDestinationFunction } from './email-destination.js'
import { createWebhookDestinationFunction } from './webhook-destination.js'
import { createSubmitterConfirmationFunction } from './submitter-confirmation.js'
import {
  createFakeEmailClient,
  createFakeInngest,
  createFakePayload,
} from './_test-helpers.js'
import { makeResolvedConfig } from '../tools/_test-helpers.js'

describe('createEmailDestinationFunction', () => {
  it('sends a form-submission email to the allowlisted address', async () => {
    const fake = createFakeInngest()
    const handle = createFakePayload()
    handle.setForm({ title: 'Contact us' })
    handle.setSubmission({
      form: { id: 'f-1' },
      createdAt: '2026-04-22T12:00:00.000Z',
      submissionData: [{ field: 'name', value: 'Ada' }],
    })
    const client = createFakeEmailClient()
    createEmailDestinationFunction({
      inngest: fake.inngest,
      payload: handle.payload,
      resolved: makeResolvedConfig(),
      getEmailClient: () => client,
    })
    await fake.invoke('form-email-destination', {
      name: 'form/destination.email',
      data: { submissionId: 's-1', destinationLabel: 'Main inbox' },
    })
    expect(client.sends).toHaveLength(1)
    expect(client.sends[0]?.to).toBe('team@example.com')
    expect(client.sends[0]?.subject).toContain('Contact us')
    const tagNames = (client.sends[0]?.tags ?? []).map((t) => t.name)
    expect(tagNames).toContain('type')
    expect(tagNames).toContain('destination')
  })

  it('skips and warns when the destination has been removed from the allowlist', async () => {
    const fake = createFakeInngest()
    const handle = createFakePayload()
    handle.setForm({ title: 'X' })
    handle.setSubmission({ form: { id: 'f-1' } })
    const client = createFakeEmailClient()
    createEmailDestinationFunction({
      inngest: fake.inngest,
      payload: handle.payload,
      resolved: makeResolvedConfig(),
      getEmailClient: () => client,
    })
    const result = (await fake.invoke('form-email-destination', {
      name: 'form/destination.email',
      data: { submissionId: 's-1', destinationLabel: 'Removed inbox' },
    })) as { skipped: boolean }
    expect(result.skipped).toBe(true)
    expect(client.sends).toHaveLength(0)
  })

  it('throws when no email client is registered (so Inngest retries)', async () => {
    const fake = createFakeInngest()
    const handle = createFakePayload()
    createEmailDestinationFunction({
      inngest: fake.inngest,
      payload: handle.payload,
      resolved: makeResolvedConfig(),
      getEmailClient: () => undefined,
    })
    await expect(
      fake.invoke('form-email-destination', {
        name: 'form/destination.email',
        data: { submissionId: 's-1', destinationLabel: 'Main inbox' },
      }),
    ).rejects.toThrow(/Email client not available/)
  })
})

describe('createWebhookDestinationFunction', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('POSTs the submission with HMAC headers to the allowlisted URL', async () => {
    const fake = createFakeInngest()
    const handle = createFakePayload()
    handle.setSubmission({
      form: { id: 'f-1' },
      submissionData: [{ field: 'name', value: 'Ada' }],
    })
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    createWebhookDestinationFunction({
      inngest: fake.inngest,
      payload: handle.payload,
      resolved: makeResolvedConfig(),
    })

    const result = (await fake.invoke('form-webhook-destination', {
      name: 'form/destination.webhook',
      data: { submissionId: 's-1', destinationLabel: 'CRM' },
    })) as { ok?: boolean; status?: number }

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://crm.example.com/leads')
    const headers = (init as RequestInit | undefined)?.headers as Record<string, string>
    expect(headers['x-throughline-event']).toBe('form/submission')
    expect(headers['x-throughline-signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(result.ok).toBe(true)
  })

  it('throws on non-2xx so Inngest retries', async () => {
    const fake = createFakeInngest()
    const handle = createFakePayload()
    handle.setSubmission({ form: { id: 'f-1' } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    createWebhookDestinationFunction({
      inngest: fake.inngest,
      payload: handle.payload,
      resolved: makeResolvedConfig(),
    })
    await expect(
      fake.invoke('form-webhook-destination', {
        name: 'form/destination.webhook',
        data: { submissionId: 's-1', destinationLabel: 'CRM' },
      }),
    ).rejects.toThrow(/HTTP 503/)
  })
})

describe('createSubmitterConfirmationFunction', () => {
  it('sends to the address in the configured email field', async () => {
    const fake = createFakeInngest()
    const handle = createFakePayload()
    handle.setForm({
      title: 'Contact',
      policy: {
        submitterConfirmation: {
          enabled: true,
          emailFieldName: 'email',
          subject: 'Thanks!',
          body: 'We received your message.',
        },
      },
    })
    handle.setSubmission({
      submissionData: [
        { field: 'name', value: 'Ada' },
        { field: 'email', value: 'ada@example.com' },
      ],
    })
    const client = createFakeEmailClient()
    createSubmitterConfirmationFunction({
      inngest: fake.inngest,
      payload: handle.payload,
      resolved: makeResolvedConfig(),
      getEmailClient: () => client,
    })
    await fake.invoke('form-submitter-confirmation', {
      name: 'form/submitter-confirmation',
      data: { submissionId: 's-1', formId: 'f-1' },
    })
    expect(client.sends).toHaveLength(1)
    expect(client.sends[0]?.to).toBe('ada@example.com')
    expect(client.sends[0]?.subject).toBe('Thanks!')
  })

  it('skips when emailFieldName is not configured', async () => {
    const fake = createFakeInngest()
    const handle = createFakePayload()
    handle.setForm({
      policy: { submitterConfirmation: { enabled: true } },
    })
    const client = createFakeEmailClient()
    createSubmitterConfirmationFunction({
      inngest: fake.inngest,
      payload: handle.payload,
      resolved: makeResolvedConfig(),
      getEmailClient: () => client,
    })
    const result = (await fake.invoke('form-submitter-confirmation', {
      name: 'form/submitter-confirmation',
      data: { submissionId: 's-1', formId: 'f-1' },
    })) as { skipped: boolean }
    expect(result.skipped).toBe(true)
    expect(client.sends).toHaveLength(0)
  })

  it('skips when the email field value is missing or invalid', async () => {
    const fake = createFakeInngest()
    const handle = createFakePayload()
    handle.setForm({
      policy: {
        submitterConfirmation: { enabled: true, emailFieldName: 'email' },
      },
    })
    handle.setSubmission({
      submissionData: [{ field: 'email', value: 'not-an-email' }],
    })
    const client = createFakeEmailClient()
    createSubmitterConfirmationFunction({
      inngest: fake.inngest,
      payload: handle.payload,
      resolved: makeResolvedConfig(),
      getEmailClient: () => client,
    })
    const result = (await fake.invoke('form-submitter-confirmation', {
      name: 'form/submitter-confirmation',
      data: { submissionId: 's-1', formId: 'f-1' },
    })) as { skipped: boolean }
    expect(result.skipped).toBe(true)
    expect(client.sends).toHaveLength(0)
  })
})

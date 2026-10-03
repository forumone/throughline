import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { createEmailClient, type TemplateRenderer } from './client.js'

const fakeTemplate = { type: 'div', props: {}, key: null } as unknown as ReactElement

const renderer: TemplateRenderer = {
  toHtml: async () => '<p>html</p>',
  toText: async () => 'plain text',
}

describe('createEmailClient', () => {
  it('renders both HTML and plaintext and forwards to Resend', async () => {
    const send = vi.fn(async () => ({ data: { id: 'msg-1' }, error: null }))
    const client = createEmailClient({
      apiKey: 'k',
      fromAddress: 'a@example.com',
      fromName: 'Acme',
      resendClient: { emails: { send } },
      render: renderer,
    })

    const result = await client.send({
      to: 'b@example.com',
      subject: 'Hello',
      template: fakeTemplate,
      tags: [{ name: 'type', value: 'test' }],
    })

    expect(send).toHaveBeenCalledTimes(1)
    const call = send.mock.calls[0]![0]
    expect(call.from).toBe('Acme <a@example.com>')
    expect(call.to).toEqual(['b@example.com'])
    expect(call.subject).toBe('Hello')
    expect(call.html).toBe('<p>html</p>')
    expect(call.text).toBe('plain text')
    expect(call.tags).toEqual([{ name: 'type', value: 'test' }])
    expect(result.id).toBe('msg-1')
    expect(result.deliveredAt).toMatch(/^\d{4}/)
  })

  it('passes an array of recipients straight through', async () => {
    const send = vi.fn(async () => ({ data: { id: 'msg-1' }, error: null }))
    const client = createEmailClient({
      apiKey: 'k',
      fromAddress: 'a@example.com',
      fromName: 'Acme',
      resendClient: { emails: { send } },
      render: renderer,
    })

    await client.send({
      to: ['c@example.com', 'd@example.com'],
      subject: 'Hi',
      template: fakeTemplate,
    })
    expect(send.mock.calls[0]![0].to).toEqual(['c@example.com', 'd@example.com'])
  })

  it('uses defaultReplyTo when no per-call replyTo is given', async () => {
    const send = vi.fn(async () => ({ data: { id: 'msg-1' }, error: null }))
    const client = createEmailClient({
      apiKey: 'k',
      fromAddress: 'a@example.com',
      fromName: 'Acme',
      defaultReplyTo: 'reply@example.com',
      resendClient: { emails: { send } },
      render: renderer,
    })
    await client.send({ to: 'b@example.com', subject: 'Hi', template: fakeTemplate })
    expect(send.mock.calls[0]![0].replyTo).toBe('reply@example.com')
  })

  it('lets a per-call replyTo win over defaultReplyTo', async () => {
    const send = vi.fn(async () => ({ data: { id: 'msg-1' }, error: null }))
    const client = createEmailClient({
      apiKey: 'k',
      fromAddress: 'a@example.com',
      fromName: 'Acme',
      defaultReplyTo: 'reply@example.com',
      resendClient: { emails: { send } },
      render: renderer,
    })
    await client.send({
      to: 'b@example.com',
      subject: 'Hi',
      template: fakeTemplate,
      replyTo: 'override@example.com',
    })
    expect(send.mock.calls[0]![0].replyTo).toBe('override@example.com')
  })

  it('throws when Resend reports an error', async () => {
    const send = vi.fn(async () => ({ data: null, error: { message: 'bounced' } }))
    const client = createEmailClient({
      apiKey: 'k',
      fromAddress: 'a@example.com',
      fromName: 'Acme',
      resendClient: { emails: { send } },
      render: renderer,
    })
    await expect(
      client.send({ to: 'b@example.com', subject: 'Hi', template: fakeTemplate }),
    ).rejects.toThrow(/Email send failed: bounced/)
  })

  it('omits replyTo when nothing is configured', async () => {
    const send = vi.fn(async () => ({ data: { id: 'msg-1' }, error: null }))
    const client = createEmailClient({
      apiKey: 'k',
      fromAddress: 'a@example.com',
      fromName: 'Acme',
      resendClient: { emails: { send } },
      render: renderer,
    })
    await client.send({ to: 'b@example.com', subject: 'Hi', template: fakeTemplate })
    expect(send.mock.calls[0]![0].replyTo).toBeUndefined()
  })
})

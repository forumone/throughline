import { describe, expect, it, vi } from 'vitest'
import type { Inngest } from 'inngest'
import type { Payload } from 'payload'
import { executeStep } from './execute.js'
import { makeContext } from '../_test-helpers.js'

describe('executeStep', () => {
  it('updates the document with _status published and bypass context', async () => {
    const update = vi.fn(async () => ({ id: 'p1' }))
    const send = vi.fn(async () => ({}))
    const ctx = makeContext({
      payload: { update } as unknown as Payload,
      inngest: { send } as unknown as Inngest,
      document: { slug: 'my-page' },
      documentId: 'p1',
    })

    const result = await executeStep(ctx)
    expect(result.pass).toBe(true)
    const updateArgs = update.mock.calls[0]?.[0] as {
      collection: string
      id: string
      data: Record<string, unknown>
      context: Record<string, unknown>
    }
    expect(updateArgs.collection).toBe('pages')
    expect(updateArgs.id).toBe('p1')
    expect(updateArgs.data['_status']).toBe('published')
    expect(typeof updateArgs.data['publishedAt']).toBe('string')
    expect(updateArgs.context.bypassPublishingServer).toBe(true)
  })

  it('fires content/page.published with first-publish flag and slug', async () => {
    const update = vi.fn(async () => ({ id: 'p1' }))
    const send = vi.fn(async () => ({}))
    const ctx = makeContext({
      payload: { update } as unknown as Payload,
      inngest: { send } as unknown as Inngest,
      document: { slug: 'my-page' }, // no publishedAt -> first publish
      documentId: 'p1',
    })

    await executeStep(ctx)
    const sendArgs = send.mock.calls[0]?.[0] as {
      name: string
      data: Record<string, unknown>
    }
    expect(sendArgs.name).toBe('content/page.published')
    expect(sendArgs.data.collection).toBe('pages')
    expect(sendArgs.data.id).toBe('p1')
    expect(sendArgs.data.slug).toBe('my-page')
    expect(sendArgs.data.isFirstPublish).toBe(true)
    expect(sendArgs.data.previousPublishedAt).toBeNull()
  })

  it('marks subsequent publishes as not-first', async () => {
    const update = vi.fn(async () => ({ id: 'p1' }))
    const send = vi.fn(async () => ({}))
    const ctx = makeContext({
      payload: { update } as unknown as Payload,
      inngest: { send } as unknown as Inngest,
      document: { slug: 'my-page', publishedAt: '2026-04-20T12:00:00.000Z' },
      documentId: 'p1',
    })

    await executeStep(ctx)
    const sendArgs = send.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(sendArgs.data.isFirstPublish).toBe(false)
    expect(sendArgs.data.previousPublishedAt).toBe('2026-04-20T12:00:00.000Z')
  })
})

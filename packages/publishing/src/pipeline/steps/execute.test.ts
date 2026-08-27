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

  /*
  The field means "when this went live". A listing sorts on it and a template
  prints it, so re-publishing an edit must not move it — and it did, on every
  publish, sending an edited article to the top of its index under today's
  date. The guard was already computed here for the event payload; it was
  simply not applied to the write.
  */
  it('leaves publishedAt alone when the document already has one', async () => {
    const update = vi.fn(async () => ({ id: 'p1' }))
    const send = vi.fn(async () => ({}))
    const ctx = makeContext({
      payload: { update } as unknown as Payload,
      inngest: { send } as unknown as Inngest,
      document: { slug: 'my-page', publishedAt: '2026-03-25T09:00:00.000Z' },
      documentId: 'p1',
    })

    await executeStep(ctx)

    const data = (update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(data['_status']).toBe('published')
    // Absent, not merely unchanged: writing the same value back would still be
    // this step deciding the date.
    expect('publishedAt' in data).toBe(false)
  })

  it('reports the date it did not overwrite, so a subscriber can still see it', async () => {
    const update = vi.fn(async () => ({ id: 'p1' }))
    const send = vi.fn(async () => ({}))
    const ctx = makeContext({
      payload: { update } as unknown as Payload,
      inngest: { send } as unknown as Inngest,
      document: { slug: 'my-page', publishedAt: '2026-03-25T09:00:00.000Z' },
      documentId: 'p1',
    })

    await executeStep(ctx)

    const sent = (send.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(sent.isFirstPublish).toBe(false)
    expect(sent.previousPublishedAt).toBe('2026-03-25T09:00:00.000Z')
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

  // The write has already landed by the time the event is sent. Failing the
  // step here told an editor the publish failed on a document that was live,
  // and lost the audit record for it.
  it('reports success with a warning when the event emission fails', async () => {
    const update = vi.fn(async () => ({ id: 'p1' }))
    const send = vi.fn(async () => {
      throw new Error('Inngest API Error: 401 Event key not found')
    })
    const ctx = makeContext({
      payload: { update } as unknown as Payload,
      inngest: { send } as unknown as Inngest,
      document: { slug: 'my-page' },
      documentId: 'p1',
    })

    const result = await executeStep(ctx)

    expect(result.pass).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings?.[0]).toContain('content/page.published')
    // The document was still published.
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('carries no warnings when the event goes out', async () => {
    const ctx = makeContext({
      payload: { update: vi.fn(async () => ({ id: 'p1' })) } as unknown as Payload,
      inngest: { send: vi.fn(async () => ({})) } as unknown as Inngest,
      document: { slug: 'my-page' },
      documentId: 'p1',
    })

    expect((await executeStep(ctx)).warnings).toBeUndefined()
  })

  /*
  The write is the first thing in the pipeline that enforces `required` — a
  draft write does not — so an empty required field inside a block reaches
  here and nowhere earlier. Thrown, it left the transport to explain itself:
  the admin got a bare message and the MCP tool got an exception, when Payload
  had already named the paths.
  */
  it('returns a failed step with the fields Payload named', async () => {
    const error = Object.assign(new Error('The following fields are invalid: layout.3.heading'), {
      name: 'ValidationError',
      data: {
        collection: 'pages',
        errors: [
          { path: 'layout.3.heading', message: 'This field is required.' },
          { path: 'title', message: 'This field is required.' },
        ],
      },
    })
    const send = vi.fn(async () => ({}))
    const ctx = makeContext({
      payload: {
        update: vi.fn(async () => {
          throw error
        }),
      } as unknown as Payload,
      inngest: { send } as unknown as Inngest,
      document: { slug: 'my-page' },
      documentId: 'p1',
    })

    const result = await executeStep(ctx)

    expect(result.pass).toBe(false)
    expect(result.code).toBe('field-validation-failed')
    expect(result.issues).toEqual([
      { field: 'layout.3.heading', message: 'This field is required.', severity: 'error' },
      { field: 'title', message: 'This field is required.', severity: 'error' },
    ])
    // Nothing was published, so nothing may claim it was.
    expect(send).not.toHaveBeenCalled()
  })

  it('counts the fields it is reporting', async () => {
    const ctx = makeContext({
      payload: {
        update: vi.fn(async () => {
          throw Object.assign(new Error('nope'), {
            data: { errors: [{ path: 'title', message: 'This field is required.' }] },
          })
        }),
      } as unknown as Payload,
      inngest: { send: vi.fn(async () => ({})) } as unknown as Inngest,
      document: { slug: 'my-page' },
      documentId: 'p1',
    })

    expect((await executeStep(ctx)).reason).toBe('1 field the collection will not accept')
  })

  /*
  A database or access failure is not an answer an editor can act on, and
  dressing it up as "fix these fields" would send them looking for a field
  that is fine. It has to keep throwing.
  */
  it('rethrows anything that is not a field rejection', async () => {
    const ctx = makeContext({
      payload: {
        update: vi.fn(async () => {
          throw new Error('connection terminated unexpectedly')
        }),
      } as unknown as Payload,
      inngest: { send: vi.fn(async () => ({})) } as unknown as Inngest,
      document: { slug: 'my-page' },
      documentId: 'p1',
    })

    await expect(executeStep(ctx)).rejects.toThrow('connection terminated unexpectedly')
  })

  it('rethrows an error whose data carries something other than field errors', async () => {
    const ctx = makeContext({
      payload: {
        update: vi.fn(async () => {
          throw Object.assign(new Error('Forbidden'), { data: { errors: ['not an object'] } })
        }),
      } as unknown as Payload,
      inngest: { send: vi.fn(async () => ({})) } as unknown as Inngest,
      document: { slug: 'my-page' },
      documentId: 'p1',
    })

    await expect(executeStep(ctx)).rejects.toThrow('Forbidden')
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

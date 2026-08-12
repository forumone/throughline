import { afterEach, describe, expect, it, vi } from 'vitest'
import { callPublishingEndpoint, describeBlock } from './publishing-client.js'

const args = {
  serverURL: 'https://cms.example.com',
  apiRoute: '/api',
  routePrefix: '/publishing',
  action: 'publish' as const,
  collection: 'pages',
  id: '1',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('callPublishingEndpoint', () => {
  it('posts to the plugin route with the session cookie', async () => {
    const fetchMock = stubFetch(() => Response.json({ published: true }))

    const result = await callPublishingEndpoint(args)

    expect(result).toEqual({ ok: true, body: { published: true } })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cms.example.com/api/publishing/publish',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    const init = fetchMock.mock.calls[0]![1]
    expect(JSON.parse(String(init.body))).toEqual({ collection: 'pages', id: '1' })
  })

  it('builds a relative URL when serverURL is empty', async () => {
    const fetchMock = stubFetch(() => Response.json({ published: true }))
    await callPublishingEndpoint({ ...args, serverURL: '' })
    expect(fetchMock).toHaveBeenCalledWith('/api/publishing/publish', expect.anything())
  })

  it('surfaces the server error message on a non-2xx response', async () => {
    stubFetch(() => Response.json({ error: 'You cannot publish this page.' }, { status: 403 }))
    const result = await callPublishingEndpoint(args)
    expect(result).toEqual({ ok: false, message: 'You cannot publish this page.' })
  })

  it('reports a status when the error body is not JSON', async () => {
    stubFetch(() => new Response('<html>502</html>', { status: 502 }))
    const result = await callPublishingEndpoint(args)
    expect(result).toEqual({ ok: false, message: 'Publishing server returned 502.' })
  })

  it('reports a reachability failure rather than throwing', async () => {
    stubFetch(() => Promise.reject(new Error('network down')))
    const result = await callPublishingEndpoint(args)
    expect(result).toEqual({ ok: false, message: 'Could not reach the publishing server.' })
  })

  // A pipeline block arrives as a 200 — it is an answer, not a failure.
  it('treats a blocked publish as a successful call with a negative body', async () => {
    stubFetch(() => Response.json({ published: false, failedAt: 'embargo' }))
    const result = await callPublishingEndpoint(args)
    expect(result).toEqual({ ok: true, body: { published: false, failedAt: 'embargo' } })
  })
})

describe('describeBlock', () => {
  it('leads with the reason and lists the step, issues and suggestion', () => {
    const { title, description } = describeBlock({
      published: false,
      failedAt: 'accessibility',
      reason: 'Two images are missing alt text.',
      issues: [
        { field: 'layout.0.image', message: 'Image has no alt text', severity: 'error' },
        { message: 'Heading level skips from h2 to h4', severity: 'error' },
      ],
      suggestion: 'Add alt text in the Hero block.',
    })

    expect(title).toBe('Two images are missing alt text.')
    expect(description).toContain('Blocked at: accessibility')
    expect(description).toContain('• layout.0.image: Image has no alt text')
    expect(description).toContain('• Heading level skips from h2 to h4')
    expect(description).toContain('Suggestion: Add alt text in the Hero block.')
  })

  it('names the failing step when the pipeline gave no reason', () => {
    expect(describeBlock({ published: false, failedAt: 'approval' }).title).toBe(
      'Publish blocked at the approval check.',
    )
  })

  it('truncates a long issue list rather than flooding the toast', () => {
    const { description } = describeBlock({
      published: false,
      reason: 'Composition is invalid.',
      issues: Array.from({ length: 8 }, (_, i) => ({
        message: `Issue ${i + 1}`,
        severity: 'error' as const,
      })),
    })

    expect(description).toContain('• Issue 5')
    expect(description).not.toContain('• Issue 6')
    expect(description).toContain('…and 3 more')
  })

  it('produces an empty description when there is nothing more to say', () => {
    expect(describeBlock({ published: false, reason: 'Nope.' }).description).toBe('')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callPublishingEndpoint,
  describeBlock,
  fieldErrorsFromBlock,
  toFormPath,
} from './publishing-client.js'

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
    expect(result).toEqual({
      ok: false,
      message:
        "Publishing didn't respond as expected (error 502). Try again; if it keeps happening, tell a site administrator.",
    })
  })

  it('reports a reachability failure rather than throwing, and says nothing changed', async () => {
    stubFetch(() => Promise.reject(new Error('network down')))
    expect(await callPublishingEndpoint(args)).toEqual({
      ok: false,
      message:
        "Couldn't connect to publish. Check your internet connection and try again. Nothing was changed.",
    })
    expect(await callPublishingEndpoint({ ...args, action: 'unschedule' })).toMatchObject({
      message: expect.stringMatching(/^Couldn't connect to cancel the schedule\./),
    })
  })

  // A pipeline block arrives as a 200 — it is an answer, not a failure.
  it('treats a blocked publish as a successful call with a negative body', async () => {
    stubFetch(() => Response.json({ published: false, failedAt: 'embargo' }))
    const result = await callPublishingEndpoint(args)
    expect(result).toEqual({ ok: true, body: { published: false, failedAt: 'embargo' } })
  })
})

describe('describeBlock', () => {
  // forumone-2026#805: no step names, no paths, no "Suggestion:".
  it('leads with the reason, lists each issue where the editor would find it, then what to do', () => {
    const { title, description } = describeBlock({
      published: false,
      failedAt: 'accessibility',
      reason: 'Two images are missing alt text.',
      issues: [
        {
          field: 'layout.0.image',
          where: 'Block 1 (Image Hero) › Image',
          message: 'This image has no alt text.',
          severity: 'error',
        },
        { message: 'Heading level skips from h2 to h4', severity: 'error' },
        { field: 'speakers.0.portrait', message: 'Unplaced.', severity: 'error' },
      ],
      suggestion: 'Add alt text in the Hero block.',
    })

    expect(title).toBe('Two images are missing alt text.')
    expect(description).toBe(
      [
        '• Block 1 (Image Hero) › Image: This image has no alt text.',
        '• Heading level skips from h2 to h4',
        '• Unplaced.',
        'Add alt text in the Hero block.',
      ].join('\n'),
    )
    expect(description).not.toContain('accessibility')
    expect(description).not.toContain('layout.0')
  })

  it('says only that it cannot be published when the pipeline gave no reason', () => {
    expect(describeBlock({ published: false, failedAt: 'approval' }).title).toBe(
      "This can't be published yet.",
    )
  })

  it('says a date the server wrote in its zone in the editor’s own', () => {
    const at = '2026-10-06T13:00:00.000Z'
    const { title, description } = describeBlock(
      {
        published: false,
        code: 'embargoed',
        reason: "This can't go live until Tue 6 Oct 2026, 1:00 pm UTC.",
        suggestion: 'Wait until Tue 6 Oct 2026, 1:00 pm UTC.',
        when: { at, text: 'Tue 6 Oct 2026, 1:00 pm UTC' },
      },
      { date: { timeZone: 'America/New_York' } },
    )
    expect(title).toBe("This can't go live until Tue 6 Oct 2026, 9:00 am.")
    expect(description).toBe('Wait until Tue 6 Oct 2026, 9:00 am.')
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

  // An editor who has read a toast listing five dotted paths still has to find
  // them. That they are marked on the fields is not something the toast
  // otherwise reveals — and it is said only when it is true.
  it('says the fields are highlighted once some of them are', () => {
    const body = {
      published: false,
      reason: 'Two fields missing.',
      issues: [
        { field: 'meta.title', message: 'SEO title is required', severity: 'error' as const },
      ],
    }

    expect(describeBlock(body, { markedFields: 1 }).description).toContain(
      'The fields with a problem are highlighted.',
    )
    expect(describeBlock(body, { markedFields: 0 }).description).not.toContain('highlighted')
    expect(describeBlock(body).description).not.toContain('highlighted')
  })
})

describe('toFormPath', () => {
  // The checks walk a document and address rows with brackets; Payload's form
  // state keys the same field with a numeric segment. An unrewritten path
  // matches no field, so the error lands nowhere.
  it('rewrites bracketed row indices as path segments', () => {
    expect(toFormPath('layout[2].image')).toBe('layout.2.image')
    expect(toFormPath('layout[0].cards[3].link')).toBe('layout.0.cards.3.link')
  })

  it('leaves a path that is already dotted alone', () => {
    expect(toFormPath('meta.title')).toBe('meta.title')
    expect(toFormPath('layout.3.heading')).toBe('layout.3.heading')
  })
})

describe('fieldErrorsFromBlock', () => {
  const formPaths = ['title', 'slug', 'meta', 'meta.title', 'layout', 'layout.0.image', 'speakers']

  it('attaches each issue to the field that caused it', () => {
    const errors = fieldErrorsFromBlock(
      {
        published: false,
        issues: [
          { field: 'meta.title', message: 'SEO title is required', severity: 'error' },
          { field: 'layout[0].image', message: 'Image is missing alt text', severity: 'error' },
        ],
      },
      formPaths,
    )

    expect(errors).toEqual([
      { path: 'meta.title', message: 'SEO title is required' },
      { path: 'layout.0.image', message: 'Image is missing alt text' },
    ])
  })

  /*
  The load-bearing restriction. Payload's reducer creates a field state entry
  for any path it is handed, and an invented entry becomes invented data on the
  next save: `speakers.0.portrait` would turn a relationship's list of ids into
  a list of objects. So an issue inside a populated relationship marks the
  relationship itself, which is the field on this screen that owns it.
  */
  it('falls back to the nearest field the form actually has', () => {
    const errors = fieldErrorsFromBlock(
      {
        published: false,
        issues: [
          {
            field: 'speakers[0].portrait',
            message: 'Image is missing alt text',
            severity: 'error',
          },
        ],
      },
      formPaths,
    )

    expect(errors).toEqual([{ path: 'speakers', message: 'Image is missing alt text' }])
  })

  it('marks the block field for a block-level composition failure', () => {
    const errors = fieldErrorsFromBlock(
      {
        published: false,
        issues: [{ field: 'layout[4]', message: 'Two heroes', severity: 'error' }],
      },
      formPaths,
    )
    expect(errors).toEqual([{ path: 'layout', message: 'Two heroes' }])
  })

  // On an ancestor, the field is no longer the location, so the issue says it.
  it('says which block a message on the block field is about', () => {
    const errors = fieldErrorsFromBlock(
      {
        published: false,
        issues: [
          { field: 'layout[4]', where: 'Block 5 (CTA)', message: 'This block is empty.' },
          { field: 'layout[0].image', where: 'Block 1 (Hero) › Image', message: 'No alt text.' },
        ],
      },
      formPaths,
    )
    expect(errors).toEqual([
      { path: 'layout', message: 'Block 5 (CTA): This block is empty.' },
      { path: 'layout.0.image', message: 'No alt text.' },
    ])
  })

  it('groups the issues that resolve to one field, because the form keeps one message per path', () => {
    const errors = fieldErrorsFromBlock(
      {
        published: false,
        issues: [
          { field: 'layout[1]', message: 'Two heroes', severity: 'error' },
          { field: 'layout[4]', message: 'Hero is not first', severity: 'error' },
          { field: 'layout[5]', message: 'Two heroes', severity: 'error' },
        ],
      },
      formPaths,
    )

    // The repeated message is said once: an editor reading a field does not
    // need to be told the same thing twice.
    expect(errors).toEqual([{ path: 'layout', message: 'Two heroes; Hero is not first' }])
  })

  it('leaves an issue with no field, and one that resolves to nothing, to the toast', () => {
    const errors = fieldErrorsFromBlock(
      {
        published: false,
        issues: [
          { message: 'This document requires approval', severity: 'error' },
          { field: '(root)', message: 'Image is missing alt text', severity: 'error' },
          { field: 'unknownField.deeper', message: 'Nope', severity: 'error' },
        ],
      },
      formPaths,
    )

    expect(errors).toEqual([])
  })

  it('returns nothing for a block that carried no issues at all', () => {
    expect(fieldErrorsFromBlock({ published: false, failedAt: 'embargo' }, formPaths)).toEqual([])
  })
})

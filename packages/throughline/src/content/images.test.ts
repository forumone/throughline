import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import {
  imageDirectiveProblem,
  isPublicHttpsUrl,
  materializeImages,
  placeholderSvg,
  type ImageRequest,
} from './images.js'

/*
Images an agent does not have: imported, uploaded, or a placeholder. #845.
No Payload here: `create` and `sharp` are stubs, which is what the write sees.
*/

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function payloadStub(withSharp = true) {
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 42,
    ...args.data,
  }))
  const sharp = vi.fn(() => ({ png: () => ({ toBuffer: async () => PNG }) }))
  return {
    payload: { create, config: withSharp ? { sharp } : {} } as unknown as Payload,
    create,
    sharp,
  }
}

function request(directive: Record<string, unknown>): ImageRequest {
  return {
    holder: {},
    name: 'image',
    path: 'layout[0].image',
    collection: 'media',
    directive: directive as never,
  }
}

describe('imageDirectiveProblem', () => {
  it('accepts the three shapes', () => {
    expect(
      imageDirectiveProblem({ importUrl: 'https://example.com/a.jpg', alt: 'A' }, 'p'),
    ).toBeUndefined()
    expect(
      imageDirectiveProblem({ file: { base64: 'aGk=', filename: 'a.png' }, alt: 'A' }, 'p'),
    ).toBeUndefined()
    expect(imageDirectiveProblem({ placeholder: { alt: 'Team photo' } }, 'p')).toBeUndefined()
  })

  it('refuses one without alt, two at once, and an address it will not fetch', () => {
    expect(imageDirectiveProblem({ importUrl: 'https://example.com/a.jpg' }, 'p')).toMatch(/alt/)
    expect(
      imageDirectiveProblem(
        { importUrl: 'https://example.com/a.jpg', placeholder: { alt: 'x' }, alt: 'A' },
        'p',
      ),
    ).toMatch(/one of/)
    expect(imageDirectiveProblem({ importUrl: 'http://example.com/a.jpg', alt: 'A' }, 'p')).toMatch(
      /https/,
    )
    expect(imageDirectiveProblem({ placeholder: {} }, 'p')).toMatch(/alt/)
  })
})

describe('isPublicHttpsUrl', () => {
  it('takes a public https host and nothing on this network', () => {
    expect(isPublicHttpsUrl('https://cdn.example.com/photo.jpg')).toBe(true)
    for (const url of [
      'https://localhost/a.png',
      'https://10.0.0.1/a.png',
      'https://[::1]/a',
      'https://x.internal/a',
      'https://example.com:8443/a',
    ]) {
      expect(isPublicHttpsUrl(url), url).toBe(false)
    }
  })
})

describe('placeholderSvg', () => {
  it('says PLACEHOLDER and what belongs there, escaped', () => {
    const svg = placeholderSvg('Team <photo> & "friends"')
    expect(svg).toContain('PLACEHOLDER')
    expect(svg).toContain('Team &#60;photo&#62; &#38; &#34;friends&#34;')
  })
})

describe('materializeImages', () => {
  it('makes a flagged placeholder and puts its id where the instruction was', async () => {
    const { payload, create } = payloadStub()
    const req = request({ placeholder: { alt: 'The team at work', label: 'Team photo' } })
    const out = await materializeImages(payload, [req], {
      user: { id: 7 },
      placeholders: { collection: 'media', field: 'placeholder' },
    })
    expect(out).toEqual({ created: [{ path: 'layout[0].image', id: 42, kind: 'placeholder' }] })
    expect(req.holder['image']).toBe(42)
    const args = create.mock.calls[0]![0] as unknown as {
      data: unknown
      file: unknown
      user?: unknown
      overrideAccess?: unknown
    }
    expect(args.data).toEqual({ alt: 'Placeholder: The team at work', placeholder: true })
    expect(args.file).toMatchObject({ mimetype: 'image/png', name: 'placeholder-team-photo.png' })
    expect(args).toMatchObject({ user: { id: 7 }, overrideAccess: false })
  })

  it('refuses a placeholder where the site has not set them up', async () => {
    const { payload } = payloadStub()
    const out = await materializeImages(payload, [request({ placeholder: { alt: 'x' } })], {
      user: undefined,
    })
    expect(out).toMatchObject({ error: expect.stringMatching(/not set up placeholder/) })
  })

  it('imports a public image, refusing one that is not an image', async () => {
    const { payload, create } = payloadStub()
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('.png')
        ? new Response(PNG, { status: 200 })
        : new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    const ok = await materializeImages(
      payload,
      [request({ importUrl: 'https://cdn.example.com/photos/team.png', alt: 'The team' })],
      { user: undefined, fetch: fetchImpl as never },
    )
    expect(ok).toEqual({ created: [{ path: 'layout[0].image', id: 42, kind: 'import' }] })
    expect(
      (
        create.mock.calls[0]![0] as unknown as {
          data: unknown
          file: unknown
          user?: unknown
          overrideAccess?: unknown
        }
      ).file,
    ).toMatchObject({
      mimetype: 'image/png',
      name: 'team.png',
    })

    const bad = await materializeImages(
      payload,
      [request({ importUrl: 'https://cdn.example.com/page', alt: 'x' })],
      { user: undefined, fetch: fetchImpl as never },
    )
    expect(bad).toMatchObject({ error: expect.stringMatching(/not an image/) })
  })

  it('uploads a file the agent can read', async () => {
    const { payload } = payloadStub()
    const out = await materializeImages(
      payload,
      [
        request({
          file: { base64: PNG.toString('base64'), filename: '/Users/me/Desktop/Team Photo.png' },
          alt: 'The team',
        }),
      ],
      { user: undefined },
    )
    expect(out).toEqual({ created: [{ path: 'layout[0].image', id: 42, kind: 'file' }] })
  })

  it('reports the images it already made when a later one fails', async () => {
    const { payload } = payloadStub()
    const out = await materializeImages(
      payload,
      [
        request({ placeholder: { alt: 'One' } }),
        request({
          file: { base64: Buffer.from('not an image').toString('base64'), filename: 'x.txt' },
          alt: 'Two',
        }),
      ],
      { user: undefined, placeholders: { collection: 'media', field: 'placeholder' } },
    )
    expect(out).toMatchObject({
      error: expect.any(String),
      created: [{ kind: 'placeholder', id: 42 }],
    })
  })
})

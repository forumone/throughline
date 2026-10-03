import { ValidationError } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@vercel/blob', () => ({ head: vi.fn(), put: vi.fn() }))

const { head, put } = await import('@vercel/blob')
const { recordStoredFacts, refuseMimeTypesOutside, refuseStorageKeyMismatch, sanitizeStoredSvg } =
  await import('./hooks.js')

/*
The four hooks, with the store mocked. Each is the check that runs on a client
upload, where Payload's own do not, so each case is one a client upload can
produce.
*/

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

describe('refuseMimeTypesOutside', () => {
  const hook = refuseMimeTypesOutside(['image/png'], (type) => `${type} is not accepted`)

  it('refuses a type off the list on create, with the message', () => {
    expect(() => hook({ data: { mimeType: 'text/html' }, operation: 'create' } as never)).toThrow(
      ValidationError,
    )
  })

  it('lets a listed type through, and leaves updates alone', () => {
    const data = { mimeType: 'image/png' }
    expect(hook({ data, operation: 'create' } as never)).toBe(data)
    expect(hook({ data: { mimeType: 'text/html' }, operation: 'update' } as never)).toEqual({
      mimeType: 'text/html',
    })
  })
})

describe('refuseStorageKeyMismatch', () => {
  const hook = refuseStorageKeyMismatch()
  const run = (data: Record<string, unknown>, file?: Record<string, unknown>) =>
    hook({ data, operation: 'create', req: { file } } as never)

  it('lets a client upload through when both halves of the key agree', () => {
    const data = { prefix: 'abc', filename: 'hero.mp4' }
    expect(run(data, { name: 'hero.mp4', clientUploadContext: { prefix: 'abc' } })).toBe(data)
  })

  it('refuses one recorded under a different name in the same folder, saying so', () => {
    expect(() =>
      run(
        { prefix: 'abc', filename: 'hero-1.mp4' },
        { name: 'hero.mp4', clientUploadContext: { prefix: 'abc' } },
      ),
    ).toThrow(ValidationError)
  })

  it('refuses one recorded in a different folder', () => {
    expect(() =>
      run(
        { prefix: 'def', filename: 'hero.mp4' },
        { name: 'hero.mp4', clientUploadContext: { prefix: 'abc' } },
      ),
    ).toThrow(ValidationError)
  })

  it('leaves a server-side write alone: it is stored under the name Payload chose', () => {
    const data = { prefix: 'abc', filename: 'hero-1.mp4' }
    expect(run(data, { name: 'hero.mp4' })).toBe(data)
    expect(run(data, undefined)).toBe(data)
  })
})

describe('sanitizeStoredSvg', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(put).mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  const doc = {
    url: 'https://blob.example/abc/logo.svg',
    mimeType: 'image/svg+xml',
    filename: 'logo.svg',
    prefix: 'abc',
  }

  it('writes a cleaned SVG back over the stored object, at its key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '<svg><script>alert(1)</script><rect/></svg>',
    })
    const log = logger()
    await sanitizeStoredSvg()({
      doc,
      operation: 'create',
      req: { payload: { logger: log } },
    } as never)
    expect(put).toHaveBeenCalledWith(
      'abc/logo.svg',
      expect.stringMatching(/^<svg><rect ?\/?><\/svg>$/),
      expect.objectContaining({
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: 'image/svg+xml',
      }),
    )
  })

  it('writes nothing when nothing was removed, or for anything but an SVG', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '<svg><rect/></svg>' })
    const req = { payload: { logger: logger() } }
    await sanitizeStoredSvg()({ doc, operation: 'create', req } as never)
    await sanitizeStoredSvg()({
      doc: { ...doc, mimeType: 'image/png' },
      operation: 'create',
      req,
    } as never)
    expect(put).not.toHaveBeenCalled()
  })

  it('swallows a failed read, so a save that happened is not failed', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const log = logger()
    await expect(
      sanitizeStoredSvg()({ doc, operation: 'create', req: { payload: { logger: log } } } as never),
    ).resolves.toBe(doc)
    expect(log.warn).toHaveBeenCalled()
  })
})

describe('recordStoredFacts', () => {
  const hook = recordStoredFacts({ mimeTypes: ['image/png', 'image/webp'] })
  const doc = {
    id: 7,
    url: 'https://blob.example/a/logo.webp',
    filename: 'logo.webp',
    filesize: 6762,
    mimeType: 'image/webp',
  }

  it('corrects the record to the stored object, without re-entering hooks', async () => {
    vi.mocked(head).mockResolvedValue({ size: 4282, contentType: 'image/webp' } as never)
    const updateOne = vi.fn()
    const result = await hook({
      doc,
      operation: 'create',
      collection: { slug: 'uploads' },
      req: { payload: { db: { updateOne }, logger: logger() } },
    } as never)
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'uploads', id: 7, data: { filesize: 4282 } }),
    )
    expect(result).toMatchObject({ filesize: 4282 })
  })

  it('does not ask the store about a local file', async () => {
    vi.mocked(head).mockClear()
    await hook({
      doc: { ...doc, url: '/media/logo.webp' },
      operation: 'create',
      collection: { slug: 'uploads' },
      req: {},
    } as never)
    expect(head).not.toHaveBeenCalled()
  })
})

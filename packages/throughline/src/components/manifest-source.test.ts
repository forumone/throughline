import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { Manifest } from '@forumone/throughline-design-contract'
import { createManifestLoader } from './manifest-source.js'

const minimalManifest: Manifest = {
  contractVersion: '1.0.0',
  designSystem: { name: 'fixture', version: '0.0.1' },
  tokens: [],
  components: {},
  build: { timestamp: '2026-04-22T00:00:00.000Z' },
}

const stubPayload = {} as Payload

describe('createManifestLoader (object source)', () => {
  it('loads and caches the provided manifest', async () => {
    const loader = createManifestLoader(
      { type: 'object', manifest: minimalManifest },
      stubPayload,
    )
    const a = await loader.get()
    const b = await loader.get()
    expect(a).toBe(b)
    expect(a.designSystem.name).toBe('fixture')
  })
})

describe('createManifestLoader (url source)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches from the URL on first call', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(minimalManifest), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    const loader = createManifestLoader(
      { type: 'url', url: 'https://example.com/m.json' },
      stubPayload,
    )
    await loader.get()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('honors refreshInterval', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(minimalManifest), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    const loader = createManifestLoader(
      { type: 'url', url: 'https://example.com/m.json', refreshInterval: 1 },
      stubPayload,
    )
    await loader.get()
    expect(fetch).toHaveBeenCalledTimes(1)

    await loader.get()
    expect(fetch).toHaveBeenCalledTimes(1) // still within window

    // Expire the window
    await new Promise((r) => setTimeout(r, 1100))
    await loader.get()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refresh() always re-fetches', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(minimalManifest), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    const loader = createManifestLoader(
      { type: 'url', url: 'https://example.com/m.json' },
      stubPayload,
    )
    await loader.get()
    await loader.refresh()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('rejects an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    )
    const loader = createManifestLoader(
      { type: 'url', url: 'https://example.com/m.json' },
      stubPayload,
    )
    await expect(loader.get()).rejects.toThrow(/HTTP 404/)
  })
})

describe('createManifestLoader (payload-collection source)', () => {
  it('finds a single document and validates the manifest body', async () => {
    const find = vi.fn(async () => ({ docs: [{ id: 'd1', data: minimalManifest }], totalDocs: 1 }))
    const payload = { find } as unknown as Payload
    const loader = createManifestLoader(
      { type: 'payload-collection', slug: 'manifests' },
      payload,
    )
    const result = await loader.get()
    expect(result.designSystem.name).toBe('fixture')
    const args = find.mock.calls[0]?.[0] as { collection: string }
    expect(args.collection).toBe('manifests')
  })

  it('honors documentId in the where clause', async () => {
    const find = vi.fn(async () => ({ docs: [{ id: 'd1', data: minimalManifest }], totalDocs: 1 }))
    const payload = { find } as unknown as Payload
    const loader = createManifestLoader(
      { type: 'payload-collection', slug: 'manifests', documentId: 'd1' },
      payload,
    )
    await loader.get()
    const args = find.mock.calls[0]?.[0] as { where?: { id: { equals: string } } }
    expect(args.where?.id.equals).toBe('d1')
  })

  it('throws when no doc is found', async () => {
    const find = vi.fn(async () => ({ docs: [], totalDocs: 0 }))
    const payload = { find } as unknown as Payload
    const loader = createManifestLoader(
      { type: 'payload-collection', slug: 'manifests', documentId: 'd1' },
      payload,
    )
    await expect(loader.get()).rejects.toThrow(/No manifest document found/)
  })

  it('falls back to the doc itself if no `data` field is present', async () => {
    const find = vi.fn(async () => ({ docs: [{ id: 'd1', ...minimalManifest }], totalDocs: 1 }))
    const payload = { find } as unknown as Payload
    const loader = createManifestLoader(
      { type: 'payload-collection', slug: 'manifests' },
      payload,
    )
    const result = await loader.get()
    expect(result.designSystem.name).toBe('fixture')
  })
})

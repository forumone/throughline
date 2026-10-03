import { describe, expect, it } from 'vitest'
import { documentContentHash } from './content-hash.js'

const page = {
  id: 'page-1',
  title: 'About us',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  _status: 'draft',
  layout: [
    { id: 'block-1', blockType: 'Hero', heading: 'Hello' },
    { id: 'block-2', blockType: 'Prose', body: 'Some words' },
  ],
}

describe('documentContentHash', () => {
  it('is stable across a save that changed nothing', async () => {
    const saved = { ...page, updatedAt: '2026-06-01T12:34:56.000Z' }
    expect(await documentContentHash(saved)).toBe(await documentContentHash(page))
  })

  // The whole point: autosave ticks `updatedAt` every couple of seconds, and
  // an approval bound to it is invalidated on every tick.
  it('is stable across many saves that changed nothing', async () => {
    const hashes = await Promise.all(
      ['00', '02', '04', '06'].map((s) =>
        documentContentHash({ ...page, updatedAt: `2026-06-01T12:34:${s}.000Z` }),
      ),
    )
    expect(new Set(hashes).size).toBe(1)
  })

  it('moves when content changes', async () => {
    const edited = { ...page, title: 'About Us' }
    expect(await documentContentHash(edited)).not.toBe(await documentContentHash(page))
  })

  it('moves when a nested block changes', async () => {
    const edited = {
      ...page,
      layout: [page.layout[0], { ...page.layout[1], body: 'Other words' }],
    }
    expect(await documentContentHash(edited)).not.toBe(await documentContentHash(page))
  })

  it('moves when blocks are reordered', async () => {
    const reordered = { ...page, layout: [page.layout[1], page.layout[0]] }
    expect(await documentContentHash(reordered)).not.toBe(await documentContentHash(page))
  })

  it('ignores key order, which JSONB does not promise to preserve', async () => {
    const reversed = Object.fromEntries(Object.entries(page).reverse())
    expect(await documentContentHash(reversed)).toBe(await documentContentHash(page))
  })

  it('ignores `updatedAt` on a populated relationship', async () => {
    const withMedia = {
      ...page,
      heroImage: { id: 'media-1', alt: 'A door', updatedAt: '2026-01-01T00:00:00.000Z' },
    }
    const mediaTouched = {
      ...withMedia,
      heroImage: { ...withMedia.heroImage, updatedAt: '2026-07-01T00:00:00.000Z' },
    }
    expect(await documentContentHash(mediaTouched)).toBe(await documentContentHash(withMedia))
  })

  // Nested ids are kept on purpose: they are how a populated relationship
  // says which document it points at.
  it('moves when a relationship points somewhere else', async () => {
    const a = { ...page, heroImage: { id: 'media-1', alt: 'A door' } }
    const b = { ...page, heroImage: { id: 'media-2', alt: 'A door' } }
    expect(await documentContentHash(b)).not.toBe(await documentContentHash(a))
  })

  it('treats a `Date` and its ISO string as the same value', async () => {
    const asDate = { ...page, publishedAt: new Date('2026-03-04T05:06:07.000Z') }
    const asString = { ...page, publishedAt: '2026-03-04T05:06:07.000Z' }
    expect(await documentContentHash(asDate)).toBe(await documentContentHash(asString))
  })

  it('treats a missing field and an `undefined` one as the same document', async () => {
    const { ...withoutReason } = page
    expect(await documentContentHash({ ...withoutReason, subtitle: undefined })).toBe(
      await documentContentHash(withoutReason),
    )
  })

  it('does not confuse a null field with an absent one', async () => {
    expect(await documentContentHash({ ...page, subtitle: null })).not.toBe(
      await documentContentHash(page),
    )
  })

  it('strips extra fields named by `exclude`, at every level', async () => {
    const a = { ...page, syncedAt: 'x', layout: [{ ...page.layout[0], syncedAt: 'x' }] }
    const b = { ...page, syncedAt: 'y', layout: [{ ...page.layout[0], syncedAt: 'y' }] }
    const opts = { exclude: ['syncedAt'] }
    expect(await documentContentHash(a, opts)).toBe(await documentContentHash(b, opts))
    expect(await documentContentHash(a, opts)).not.toBe(await documentContentHash(a))
  })

  it('returns a hex sha-256', async () => {
    expect(await documentContentHash(page)).toMatch(/^[0-9a-f]{64}$/)
  })
})

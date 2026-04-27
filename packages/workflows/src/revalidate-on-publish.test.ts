import { describe, expect, it, vi } from 'vitest'
import { createRevalidateOnPublishFunction } from './revalidate-on-publish.js'
import { createFakeInngest, createFakePayload } from './_test-helpers.js'

describe('createRevalidateOnPublishFunction', () => {
  it('registers triggers for the publishing taxonomy', () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    createRevalidateOnPublishFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      revalidate: vi.fn(async () => {}),
    })
    expect(fakeInngest.functions[0]?.id).toBe('revalidate-on-publish')
    const triggers = fakeInngest.functions[0]?.options['triggers'] as Array<{ event: string }>
    expect(triggers.map((t) => t.event)).toEqual([
      'content/page.published',
      'content/page.unpublished',
      'content/page.rolled_back',
    ])
  })

  it('revalidates the page path, listings, and sitemap on publish', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    const revalidate = vi.fn(async () => {})
    createRevalidateOnPublishFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      revalidate,
    })

    await fakeInngest.invoke('revalidate-on-publish', {
      name: 'content/page.published',
      data: { collection: 'pages', slug: 'about' },
    })

    expect(revalidate).toHaveBeenCalledTimes(3)
    expect(revalidate).toHaveBeenNthCalledWith(1, { path: '/about', tags: ['pages'] })
    expect(revalidate).toHaveBeenNthCalledWith(2, { path: '', tags: ['pages'] })
    expect(revalidate).toHaveBeenNthCalledWith(3, { path: '/sitemap.xml', tags: ['sitemap'] })
  })

  it('maps the home slug to root and applies built-in posts builder', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    const revalidate = vi.fn(async () => {})
    createRevalidateOnPublishFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      revalidate,
    })

    await fakeInngest.invoke('revalidate-on-publish', {
      name: 'content/page.published',
      data: { collection: 'pages', slug: 'home' },
    })
    expect(revalidate).toHaveBeenNthCalledWith(1, { path: '/', tags: ['pages'] })

    revalidate.mockClear()
    await fakeInngest.invoke('revalidate-on-publish', {
      name: 'content/page.published',
      data: { collection: 'posts', slug: 'launch' },
    })
    expect(revalidate).toHaveBeenNthCalledWith(1, { path: '/blog/launch', tags: ['posts'] })
  })

  it('honours custom urlBuilders and collectionTags', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    const revalidate = vi.fn(async () => {})
    createRevalidateOnPublishFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      revalidate,
      urlBuilders: { programs: (slug) => `/programs/${slug}` },
      collectionTags: { programs: ['programs', 'sitemap'] },
    })

    await fakeInngest.invoke('revalidate-on-publish', {
      name: 'content/page.published',
      data: { collection: 'programs', slug: 'youth' },
    })
    expect(revalidate).toHaveBeenNthCalledWith(1, {
      path: '/programs/youth',
      tags: ['programs', 'sitemap'],
    })
  })

  it('falls back to /<slug> for unknown collections', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    const revalidate = vi.fn(async () => {})
    createRevalidateOnPublishFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      revalidate,
    })

    await fakeInngest.invoke('revalidate-on-publish', {
      name: 'content/page.published',
      data: { collection: 'mystery', slug: 'item' },
    })
    expect(revalidate).toHaveBeenNthCalledWith(1, { path: '/item', tags: ['mystery'] })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { revalidateOnPublishJob } from './revalidate-on-publish.js'
import { createCacheTags } from '../../cache-tags.js'
import {
  createFakeInngest,
  createFakePayload,
  asInngestFunction,
} from '../../jobs/_test-helpers.js'
import type { RevalidateOnPublishOptions } from '../../jobs/workflow-types.js'

const pagesBuilder = (slug: string) => (slug === 'home' ? '/' : `/${slug}`)

function setup(overrides: Partial<RevalidateOnPublishOptions> = {}) {
  const fakeInngest = createFakeInngest()
  const revalidate = vi.fn(async () => {})
  asInngestFunction(revalidateOnPublishJob, {
    inngest: fakeInngest.inngest,
    payload: createFakePayload().payload,
    revalidate,
    urlBuilders: { pages: pagesBuilder },
    ...overrides,
  })
  return { fakeInngest, revalidate }
}

describe('revalidateOnPublishJob', () => {
  it('registers triggers for the publishing taxonomy', () => {
    const { fakeInngest } = setup()
    expect(fakeInngest.functions[0]?.id).toBe('revalidate-on-publish')
    const triggers = fakeInngest.functions[0]?.options['triggers'] as Array<{ event: string }>
    expect(triggers.map((t) => t.event)).toEqual([
      'content/page.published',
      'content/page.unpublished',
      'content/page.rolled_back',
    ])
  })

  it('revalidates the page path, listings, and sitemap on publish', async () => {
    const { fakeInngest, revalidate } = setup()

    await fakeInngest.invoke('revalidate-on-publish', {
      name: 'content/page.published',
      data: { collection: 'pages', slug: 'about' },
    })

    expect(revalidate).toHaveBeenCalledTimes(3)
    expect(revalidate).toHaveBeenNthCalledWith(1, { path: '/about', tags: ['pages'] })
    expect(revalidate).toHaveBeenNthCalledWith(2, { path: '', tags: ['pages'] })
    expect(revalidate).toHaveBeenNthCalledWith(3, { path: '/sitemap.xml', tags: ['sitemap'] })
  })

  it('uses the builder the site gives it', async () => {
    const { fakeInngest, revalidate } = setup({
      urlBuilders: { pages: pagesBuilder, posts: (slug) => `/news/${slug}` },
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
    expect(revalidate).toHaveBeenNthCalledWith(1, { path: '/news/launch', tags: ['posts'] })
  })

  /*
  The regression this guards against. There used to be built-in builders, and
  `posts` mapped to `/blog/<slug>` — so a site serving posts anywhere else
  revalidated a path it does not have, and the real page stayed stale with
  nothing in any log to say so.
  */
  it('guesses no path for a collection it has no builder for', async () => {
    const { fakeInngest, revalidate } = setup()
    const warn = vi.fn()

    await fakeInngest.invoke(
      'revalidate-on-publish',
      { name: 'content/page.published', data: { collection: 'posts', slug: 'launch' } },
      { warn },
    )

    const paths = (revalidate.mock.calls as unknown as Array<[{ path: string }]>).map(
      ([input]) => input.path,
    )
    expect(paths).not.toContain('/blog/launch')
    expect(paths).not.toContain('/launch')
    expect(paths).toEqual(['', '/sitemap.xml'])
    // The tags are still dropped, so tag-cached readers refresh.
    expect(revalidate).toHaveBeenCalledWith({ path: '', tags: ['posts'] })
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('urlBuilders'),
      expect.objectContaining({ collection: 'posts' }),
    )
  })

  it('does not treat an inherited property as a builder', async () => {
    const { fakeInngest, revalidate } = setup()

    await fakeInngest.invoke('revalidate-on-publish', {
      name: 'content/page.published',
      data: { collection: 'toString', slug: 'x' },
    })

    expect(revalidate).toHaveBeenCalledTimes(2)
  })

  it('honours collectionTags over the scheme', async () => {
    const { fakeInngest, revalidate } = setup({
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

  it('names its tags with the cacheTags scheme the readers share', async () => {
    const cacheTags = createCacheTags({ collection: (slug) => `collection:${slug}` })
    const { fakeInngest, revalidate } = setup({ cacheTags })

    await fakeInngest.invoke('revalidate-on-publish', {
      name: 'content/page.published',
      data: { collection: 'pages', slug: 'about' },
    })
    expect(revalidate).toHaveBeenNthCalledWith(1, {
      path: '/about',
      tags: [cacheTags.collection('pages')],
    })
  })
})

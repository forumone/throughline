import { describe, expect, it } from 'vitest'
import type { Inngest } from 'inngest'
import { resolveCollection, validateOptions } from './options.js'

const fakeInngest = {} as Inngest

describe('validateOptions', () => {
  it('accepts a minimal valid config', () => {
    const result = validateOptions({
      collections: [{ slug: 'pages' }],
      inngest: fakeInngest,
    })
    expect(result.collections).toHaveLength(1)
  })

  it('throws when collections are missing or empty', () => {
    expect(() =>
      validateOptions({ collections: [], inngest: fakeInngest }),
    ).toThrow(/at least one collection/)
  })

  it('throws when inngest is missing', () => {
    expect(() =>
      validateOptions({ collections: [{ slug: 'pages' }] } as never),
    ).toThrow(/Inngest client/)
  })

  it('throws on a malformed collection entry', () => {
    expect(() =>
      validateOptions({
        collections: [{ slug: '' } as never],
        inngest: fakeInngest,
      }),
    ).toThrow(/Invalid collection config/)
  })

  it('throws when requiredFields entries are malformed', () => {
    expect(() =>
      validateOptions({
        collections: [
          { slug: 'pages', requiredFields: [{ path: '', message: 'x' }] },
        ],
        inngest: fakeInngest,
      }),
    ).toThrow(/Invalid collection config/)
  })
})

describe('resolveCollection', () => {
  const options = {
    collections: [
      { slug: 'pages' },
      {
        slug: 'posts',
        layoutField: 'content',
        publishedAtField: 'goLiveAt',
        requiredFields: [{ path: 'authors', message: 'Author is required' }],
      },
    ],
    inngest: fakeInngest,
  }

  it('fills in defaults for unset fields', () => {
    const resolved = resolveCollection(options, 'pages')
    expect(resolved.layoutField).toBe('layout')
    expect(resolved.seoField).toBe('seo')
    expect(resolved.policyField).toBe('policy')
    expect(resolved.slugField).toBe('slug')
    expect(resolved.publishedAtField).toBe('publishedAt')
    expect(resolved.scheduledPublishField).toBe('scheduledPublishAt')
    expect(resolved.requiredFields).toBeUndefined()
  })

  it('honors per-collection overrides', () => {
    const resolved = resolveCollection(options, 'posts')
    expect(resolved.layoutField).toBe('content')
    expect(resolved.publishedAtField).toBe('goLiveAt')
    expect(resolved.requiredFields).toEqual([{ path: 'authors', message: 'Author is required' }])
  })

  it('throws for unknown slugs', () => {
    expect(() => resolveCollection(options, 'ghost')).toThrow(/not registered as publishable/)
  })
})

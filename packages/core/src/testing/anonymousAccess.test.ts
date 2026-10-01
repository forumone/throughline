import type { Access, CollectionConfig, GlobalConfig } from 'payload'
import { describe, expect, it } from 'vitest'
import { createAuditCollection } from '../audit/collection.js'
import { checkAnonymousAccess, type AnonymousAccessBuckets } from './anonymousAccess.js'
import { describeAnonymousAccess } from './describeAnonymousAccess.js'

/*
A small site, as a config: two collections a page reads, three it must not —
one of them the real audit collection — and a global.

Synthetic rather than a `buildConfig` result so the cases below can break one
thing at a time. The shape is the slice of `SanitizedConfig` the helper reads,
and a sanitized config satisfies it.
*/

const publishedOrSignedIn: Access = ({ req: { user } }) =>
  user ? true : { _status: { equals: 'published' } }
const anyone: Access = () => true
const signedIn: Access = ({ req: { user } }) => Boolean(user)

const pages: CollectionConfig = {
  slug: 'pages',
  versions: { drafts: true },
  access: { read: publishedOrSignedIn },
  fields: [],
}
const media: CollectionConfig = { slug: 'media', access: { read: anyone }, fields: [] }
const users: CollectionConfig = {
  slug: 'users',
  auth: true,
  access: { read: signedIn },
  fields: [],
}
// No rule at all: Payload's default, which needs a user.
const preferences: CollectionConfig = { slug: 'payload-preferences', fields: [] }
const navigation: GlobalConfig = { slug: 'navigation', access: { read: anyone }, fields: [] }

const site = {
  collections: [pages, media, users, createAuditCollection(), preferences],
  globals: [navigation],
}

const buckets: AnonymousAccessBuckets = {
  renderPath: {
    pages: 'the page route',
    media: 'every populated upload',
  },
  private: {
    users: 'accounts',
    'audit-events': 'who did what',
    'payload-preferences': 'admin UI state',
  },
  globals: { renderPath: { navigation: 'the header and footer' } },
}

// The helper itself, registered against the sound config: every test it adds
// has to pass, which is the half of its behaviour a finding list cannot show.
describeAnonymousAccess(site, buckets, { title: 'describeAnonymousAccess on a sound config' })

// And against the promise `buildConfig` returns, which is what a site hands it.
describeAnonymousAccess(Promise.resolve(site), buckets, { title: 'with a config promise' })

describe('checkAnonymousAccess', () => {
  it('finds nothing wrong with a sound config', async () => {
    expect(await checkAnonymousAccess(site, buckets)).toEqual([])
  })

  it('fails a collection in no bucket, so adding one forces a decision', async () => {
    const forms: CollectionConfig = { slug: 'forms', access: { read: anyone }, fields: [] }
    const findings = await checkAnonymousAccess(
      { ...site, collections: [...site.collections, forms] },
      buckets,
    )
    expect(findings).toEqual([
      expect.objectContaining({ kind: 'unclassified', slug: 'forms', entity: 'collection' }),
    ])
  })

  it('fails a collection in both buckets', async () => {
    const findings = await checkAnonymousAccess(site, {
      ...buckets,
      private: [...Object.keys(buckets.private as Record<string, string>), 'media'],
    })
    expect(findings.map((f) => [f.kind, f.slug])).toContainEqual(['classified-twice', 'media'])
  })

  it('fails a bucket entry the config no longer has', async () => {
    const findings = await checkAnonymousAccess(site, {
      ...buckets,
      renderPath: { ...buckets.renderPath, posts: 'the blog' },
    })
    expect(findings).toEqual([expect.objectContaining({ kind: 'not-in-config', slug: 'posts' })])
  })

  it('fails a render-path collection that refuses an anonymous read', async () => {
    const closed = { ...media, access: { read: signedIn } }
    const findings = await checkAnonymousAccess(
      { ...site, collections: [pages, closed, users, createAuditCollection(), preferences] },
      buckets,
    )
    expect(findings).toEqual([
      expect.objectContaining({ kind: 'render-path-refused', slug: 'media' }),
    ])
  })

  it('fails a render-path collection with no read rule, which is the same outage', async () => {
    const unruled: CollectionConfig = { slug: 'media', fields: [] }
    const findings = await checkAnonymousAccess(
      { ...site, collections: [pages, unruled, users, createAuditCollection(), preferences] },
      buckets,
    )
    expect(findings).toEqual([
      expect.objectContaining({ kind: 'render-path-refused', slug: 'media' }),
    ])
    expect(findings[0]?.message).toContain('no read rule')
  })

  it('fails a collection with drafts that answers a bare true', async () => {
    const leaky = { ...pages, access: { read: anyone } }
    const findings = await checkAnonymousAccess(
      { ...site, collections: [leaky, media, users, createAuditCollection(), preferences] },
      buckets,
    )
    expect(findings).toEqual([
      expect.objectContaining({ kind: 'drafts-unfiltered', slug: 'pages' }),
    ])
  })

  it('fails a private collection that answers true, or a query', async () => {
    const open = { ...users, access: { read: anyone } }
    const narrowed = { ...preferences, access: { read: publishedOrSignedIn } }
    const findings = await checkAnonymousAccess(
      { ...site, collections: [pages, media, open, createAuditCollection(), narrowed] },
      buckets,
    )
    expect(findings.map((f) => [f.kind, f.slug])).toEqual([
      ['private-readable', 'users'],
      ['private-readable', 'payload-preferences'],
    ])
  })

  it('checks globals only when they are bucketed, and then exhaustively', async () => {
    const footer: GlobalConfig = { slug: 'footer', access: { read: anyone }, fields: [] }
    const withFooter = { ...site, globals: [navigation, footer] }

    const { globals: _omitted, ...withoutGlobals } = buckets
    expect(await checkAnonymousAccess(withFooter, withoutGlobals)).toEqual([])

    expect(await checkAnonymousAccess(withFooter, buckets)).toEqual([
      expect.objectContaining({ kind: 'unclassified', slug: 'footer', entity: 'global' }),
    ])
  })

  it('refuses to guess for a rule that reaches for the database', async () => {
    const lookup: Access = async ({ req }) => {
      await req.payload.find({ collection: 'users' })
      return true
    }
    const needsDb = { ...media, access: { read: lookup } }
    await expect(
      checkAnonymousAccess(
        { ...site, collections: [pages, needsDb, users, createAuditCollection(), preferences] },
        buckets,
      ),
    ).rejects.toThrow(/payload\.find/)
  })
})

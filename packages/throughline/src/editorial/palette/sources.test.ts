import { describe, expect, it } from 'vitest'
import { whereQuery } from '../health/checks.js'
import {
  byIdsUrl,
  documentFromPath,
  matchCommands,
  matchRank,
  pushRecent,
  readRecent,
  RECENT_LIMIT,
  searchUrl,
  searchWhere,
  type Command,
  type SearchSource,
} from './sources.js'

/*
The command palette's pure half, ported from forumone-2026's
`admin/palette/sources.test.ts`: what it asks the REST API, how it orders what
comes back, and what it remembers. The dialog itself needs a browser.
*/

const posts: SearchSource = {
  slug: 'posts',
  titleField: 'title',
  searchFields: ['title', 'slug'],
  drafts: true,
}
const media: SearchSource = {
  slug: 'media',
  titleField: 'filename',
  searchFields: ['filename', 'alt'],
  drafts: false,
}

describe('searchUrl', () => {
  it('ORs every search field, keeps one field, and reads the latest draft', () => {
    // Byte for byte the URL forumone-2026's palette sent.
    expect(decodeURIComponent(searchUrl('/api', posts, ' NTC '))).toBe(
      '/api/posts?where[or][0][title][like]=NTC&where[or][1][slug][like]=NTC' +
        '&limit=5&depth=0&select[title]=true&sort=-updatedAt&draft=true',
    )
  })

  it('is written from searchWhere, so the palette and search_content ask the same thing', () => {
    expect(
      searchUrl('/api', posts, 'about')
        .split('?')[1]
        ?.startsWith(whereQuery(searchWhere(posts, 'about'))),
    ).toBe(true)
  })

  it('does not ask for drafts from a collection without them', () => {
    const url = searchUrl('/api', media, 'logo')
    expect(url).not.toContain('draft')
    expect(decodeURIComponent(url)).toContain('where[or][1][alt][like]=logo')
  })

  it('encodes what the person typed', () => {
    expect(searchUrl('/api', posts, 'a&b=c')).toContain('=a%26b%3Dc')
  })

  it('looks recent documents up by id', () => {
    expect(decodeURIComponent(byIdsUrl('/api', posts, ['3', '9']))).toContain(
      'where[id][in]=3,9&limit=2',
    )
  })
})

describe('matchRank', () => {
  it('orders exact, prefix, word start, anywhere', () => {
    expect(matchRank('About', 'about')).toBe(0)
    expect(matchRank('About us', 'about')).toBe(1)
    expect(matchRank('What we talk about', 'about')).toBe(2)
    expect(matchRank('Roundabout', 'about')).toBe(3)
  })
})

describe('matchCommands', () => {
  const commands: Command[] = [
    { id: 'a', label: 'Media', hint: 'Go to', href: '/admin/collections/media' },
    { id: 'b', label: 'Post', hint: 'New', href: '/admin/collections/posts/create' },
    {
      id: 'c',
      label: 'Content health',
      hint: 'Go to',
      href: '/admin/content-health',
      keywords: 'stale',
    },
  ]

  it('matches every word against hint, label and keywords', () => {
    expect(matchCommands(commands, 'new post').map((c) => c.id)).toEqual(['b'])
    expect(matchCommands(commands, 'stale').map((c) => c.id)).toEqual(['c'])
    expect(matchCommands(commands, 'go to')).toHaveLength(2)
  })

  it('offers nothing before anything is typed', () => {
    expect(matchCommands(commands, '  ')).toEqual([])
  })
})

describe('recently opened', () => {
  const searched = ['posts', 'pages']

  it('recognises a document editor of a searched collection, and nothing else', () => {
    expect(documentFromPath('/admin/collections/posts/12', '/admin', searched)).toEqual({
      collection: 'posts',
      id: '12',
    })
    expect(documentFromPath('/admin/collections/posts/12/versions', '/admin', searched)).toEqual({
      collection: 'posts',
      id: '12',
    })
    expect(documentFromPath('/admin/collections/posts', '/admin', searched)).toBeNull()
    expect(documentFromPath('/admin/collections/posts/create', '/admin', searched)).toBeNull()
    expect(documentFromPath('/admin/collections/users/1', '/admin', searched)).toBeNull()
    expect(documentFromPath('/admin/globals/navigation', '/admin', searched)).toBeNull()
  })

  it('moves a reopened document to the front, once, and caps the list', () => {
    let list = Array.from({ length: RECENT_LIMIT }, (_, i) => ({
      collection: 'posts',
      id: String(i),
    }))
    list = pushRecent(list, { collection: 'posts', id: '3' })
    expect(list[0]).toEqual({ collection: 'posts', id: '3' })
    expect(list).toHaveLength(RECENT_LIMIT)
    list = pushRecent(list, { collection: 'pages', id: '1' })
    expect(list).toHaveLength(RECENT_LIMIT)
    expect(list.filter((e) => e.id === '3')).toHaveLength(1)
  })

  it('reads a malformed preference as empty', () => {
    expect(readRecent(undefined)).toEqual([])
    expect(readRecent({ nope: true })).toEqual([])
    expect(
      readRecent([
        { collection: 'posts', id: 1 },
        { collection: 'pages', id: '2' },
      ]),
    ).toEqual([{ collection: 'pages', id: '2' }])
  })
})

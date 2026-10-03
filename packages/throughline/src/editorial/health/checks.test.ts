import { describe, expect, it } from 'vitest'
import {
  listHref,
  missingAltCheck,
  missingSeoCheck,
  monthsBefore,
  staleCheck,
  whereQuery,
} from './checks.js'

/*
The content-health rules as values, ported from forumone-2026's
`admin/health/rules.test.ts`. A wrong threshold, or a `where` the list view
cannot parse, is the whole way this feature fails quietly.
*/

const now = new Date('2026-09-29T12:00:00.000Z')
const published = { or: [{ _status: { equals: 'published' } }, { publishedAt: { exists: true } }] }

describe('staleCheck', () => {
  const check = staleCheck({ after: { pages: 12, capabilities: 6 } })

  it('runs over the collections it has a threshold for, and only those', () => {
    expect(check.collections).toEqual(['pages', 'capabilities'])
    expect(check.where('posts', now)).toBeNull()
  })

  it('counts calendar months', () => {
    expect(monthsBefore(now, 12)).toBe('2025-09-29T12:00:00.000Z')
    expect(JSON.stringify(check.where('capabilities', now))).toContain(
      '"less_than":"2026-03-29T12:00:00.000Z"',
    )
  })

  it('follows the date fallback: revisedAt, then publishedAt, then createdAt', () => {
    // The same query forumone-2026's view ran, byte for byte, so its list links still match.
    expect(check.where('pages', now)).toEqual({
      and: [
        published,
        {
          or: [
            { revisedAt: { less_than: '2025-09-29T12:00:00.000Z' } },
            {
              and: [
                { revisedAt: { exists: false } },
                { publishedAt: { less_than: '2025-09-29T12:00:00.000Z' } },
              ],
            },
            {
              and: [
                { revisedAt: { exists: false } },
                { publishedAt: { exists: false } },
                { createdAt: { less_than: '2025-09-29T12:00:00.000Z' } },
              ],
            },
          ],
        },
      ],
    })
  })

  it('takes other date fields, and a site with no first-publish stamp', () => {
    const custom = staleCheck({ after: { pages: 12 }, dates: ['updatedAt'], publishedField: false })
    expect(custom.where('pages', now)).toEqual({
      and: [
        { _status: { equals: 'published' } },
        { or: [{ updatedAt: { less_than: '2025-09-29T12:00:00.000Z' } }] },
      ],
    })
  })

  it('dates a row by the first field that is set, oldest first', () => {
    expect(
      check.describe?.({ publishedAt: '2024-01-01T00:00:00.000Z', createdAt: '2020-01-01' }, now),
    ).toEqual({
      at: '2024-01-01T00:00:00.000Z',
    })
    expect(check.describe?.({}, now)).toEqual({ note: 'never dated' })
    const rows = [
      { id: 1, title: 'b', at: '2025-01-01' },
      { id: 2, title: 'a', at: '2024-01-01' },
    ]
    expect(rows.sort(check.order!).map((row) => row.id)).toEqual([2, 1])
  })
})

describe('missingSeoCheck', () => {
  it("asks about published, indexable documents, by the SEO plugin's field names", () => {
    const where = missingSeoCheck({ collections: ['pages'] }).where('pages', now) as {
      and: object[]
    }
    expect(where.and[0]).toEqual(published)
    expect(where.and[1]).toEqual({ 'meta.noIndex': { not_equals: true } })
    expect(where.and[2]).toEqual({
      or: [
        { 'meta.description': { exists: false } },
        { 'meta.description': { equals: '' } },
        { 'meta.image': { exists: false } },
      ],
    })
  })

  it('takes other field names, and none for noIndex', () => {
    const check = missingSeoCheck({
      collections: ['pages'],
      fields: { description: 'seo.summary', noIndex: false },
    })
    const where = JSON.stringify(check.where('pages', now))
    expect(where).toContain('seo.summary')
    expect(where).not.toContain('noIndex')
    expect(check.select).toEqual({ title: true, seo: { summary: true }, meta: { image: true } })
  })

  it('says what is missing', () => {
    const check = missingSeoCheck({ collections: ['pages'] })
    expect(check.describe?.({ meta: { description: '', image: null } }, now)).toEqual({
      note: 'no description or image',
    })
    expect(check.describe?.({ meta: { description: 'x' } }, now)).toEqual({ note: 'no image' })
  })
})

describe('missingAltCheck', () => {
  it('needs a way to tell which images are in use, unless told to list them all', () => {
    expect(() => missingAltCheck()).toThrow(/inUse/)
    expect(missingAltCheck({ onlyInUse: false }).costly).toBeUndefined()
    expect(missingAltCheck({ inUse: async () => new Set() }).costly).toBe(true)
  })
})

describe('list links', () => {
  it('writes a where as the bracket notation the list view parses', () => {
    expect(whereQuery({ or: [{ title: { equals: 'A & B' } }] })).toBe(
      'where%5Bor%5D%5B0%5D%5Btitle%5D%5Bequals%5D=A%20%26%20B',
    )
  })

  it('keeps booleans and dotted paths intact', () => {
    expect(decodeURIComponent(whereQuery({ 'meta.image': { exists: false } }))).toBe(
      'where[meta.image][exists]=false',
    )
  })

  it('points at the collection list under the admin route', () => {
    expect(listHref('/admin', 'pages', { id: { equals: 1 } })).toBe(
      '/admin/collections/pages?where%5Bid%5D%5Bequals%5D=1',
    )
  })
})

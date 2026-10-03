import type { Block, Field } from 'payload'
import { describe, expect, it } from 'vitest'
import { couldReference, referencesIn, referencesTo } from './walk.js'

/*
The walk that answers "what uses this?", against field configs rather than a
database. Ported from forumone-2026 (`media/usage.test.ts`).

Mostly about not missing things, since a missed reference is a delete that
succeeds and an image that vanishes from a published page, and about not
inventing them, since refusing a delete nobody can then perform is its own
defect.
*/

const opts = (blocks: readonly Block[] = []) => ({ collection: 'media' as const, blocks })
const upload = (name: string): Field => ({ name, type: 'upload', relationTo: 'media' })

describe('the shapes a reference can hide in', () => {
  it('finds a plain upload field', () => {
    expect(referencesIn([upload('heroImage')], { heroImage: 4 }, opts())).toEqual([
      { id: 4, path: 'heroImage', viaBlock: false },
    ])
  })

  it('finds one inside a group', () => {
    const fields: Field[] = [{ name: 'seo', type: 'group', fields: [upload('image')] }]
    expect(referencesIn(fields, { seo: { image: 9 } }, opts())).toEqual([
      { id: 9, path: 'seo › image', viaBlock: false },
    ])
  })

  it('finds one in every row of an array, and says which row', () => {
    const fields: Field[] = [{ name: 'logos', type: 'array', fields: [upload('logo')] }]
    const refs = referencesIn(fields, { logos: [{ logo: 1 }, { logo: 2 }] }, opts())
    expect(refs.map((r) => r.id)).toEqual([1, 2])
    expect(refs[1]?.path).toBe('logos[1] › logo')
  })

  it('finds one under an unnamed wrapper, which shares the parent data object', () => {
    const fields: Field[] = [{ type: 'row', fields: [upload('image')] }]
    expect(referencesIn(fields, { image: 7 }, opts())).toHaveLength(1)
  })

  it('handles both kinds of tab', () => {
    const named: Field[] = [
      { type: 'tabs', tabs: [{ name: 'content', fields: [upload('image')] }] },
    ]
    expect(referencesIn(named, { content: { image: 3 } }, opts())).toEqual([
      { id: 3, path: 'content › image', viaBlock: false },
    ])
    const unnamed: Field[] = [
      { type: 'tabs', tabs: [{ label: 'Content', fields: [upload('image')] }] },
    ]
    expect(referencesIn(unnamed, { image: 3 }, opts())).toHaveLength(1)
  })

  it('reads a populated relationship as well as a bare id', () => {
    // Coercing the object would give `[object Object]`, match nothing, and fail open.
    expect(referencesIn([upload('image')], { image: { id: 5, url: '/x.png' } }, opts())).toEqual([
      { id: 5, path: 'image', viaBlock: false },
    ])
  })

  it('finds hasMany and polymorphic relationships, counting only the collection asked about', () => {
    const fields: Field[] = [
      { name: 'topics', type: 'relationship', relationTo: 'terms', hasMany: true },
      { name: 'related', type: 'relationship', relationTo: ['terms', 'pages'], hasMany: true },
    ]
    const data = {
      topics: [1, { id: 2 }],
      related: [
        { relationTo: 'terms', value: 3 },
        { relationTo: 'pages', value: 3 },
      ],
    }
    expect(referencesIn(fields, data, { collection: 'terms' }).map((r) => [r.id, r.path])).toEqual([
      [1, 'topics'],
      [2, 'topics'],
      [3, 'related'],
    ])
  })
})

describe('rich text', () => {
  const fields: Field[] = [{ name: 'body', type: 'richText' }]

  it('finds an embedded upload', () => {
    const body = {
      root: {
        children: [{ type: 'paragraph' }, { type: 'upload', relationTo: 'media', value: 12 }],
      },
    }
    expect(referencesIn(fields, { body }, opts())).toEqual([
      { id: 12, path: 'body › embedded upload', viaBlock: false },
    ])
  })

  it('finds an embedded link to a document', () => {
    const body = {
      root: { children: [{ type: 'relationship', relationTo: 'people', value: { id: 4 } }] },
    }
    expect(referencesIn(fields, { body }, { collection: 'people' })).toEqual([
      { id: 4, path: 'body › embedded link', viaBlock: false },
    ])
  })

  it('walks a block inside rich text as the block it names', () => {
    /*
    The case forumone-2026's walker missed: an article body can hold blocks, a
    block can hold an image, and that image had no reference anyone could find.
    */
    const registry: Block[] = [{ slug: 'Figure', fields: [upload('image')] }]
    const body = {
      root: {
        children: [
          { type: 'block', fields: { blockType: 'Figure', image: 8 } },
          {
            type: 'paragraph',
            children: [{ type: 'inlineBlock', fields: { blockType: 'Figure', image: 9 } }],
          },
        ],
      },
    }
    expect(referencesIn(fields, { body }, opts(registry))).toEqual([
      { id: 8, path: 'body › Figure › image', viaBlock: true },
      { id: 9, path: 'body › Figure › image', viaBlock: true },
    ])
  })

  it('ignores an upload node for another collection, and an unknown block', () => {
    const body = {
      root: {
        children: [
          { type: 'upload', relationTo: 'documents', value: 12 },
          { type: 'block', fields: { blockType: 'Gone', image: 8 } },
        ],
      },
    }
    expect(referencesIn(fields, { body }, opts())).toEqual([])
  })
})

describe('what it must not claim', () => {
  it('does not treat a number in an ordinary field as a reference', () => {
    // The reason this is a structural walk rather than a string search.
    const fields: Field[] = [
      { name: 'columns', type: 'number' },
      { name: 'heading', type: 'text' },
    ]
    expect(referencesIn(fields, { columns: 4, heading: '4' }, opts())).toEqual([])
  })

  it('ignores an upload pointing at another collection', () => {
    const fields: Field[] = [{ name: 'doc', type: 'upload', relationTo: 'documents' }]
    expect(referencesIn(fields, { doc: 4 }, opts())).toEqual([])
  })

  it('survives null, undefined and an empty document', () => {
    const fields: Field[] = [upload('image'), { name: 'body', type: 'richText' }]
    expect(referencesIn(fields, undefined, opts())).toEqual([])
    expect(referencesIn(fields, {}, opts())).toEqual([])
    expect(referencesIn(fields, { image: null, body: null }, opts())).toEqual([])
  })
})

describe('blocks, which are the references with no foreign key', () => {
  const ImageHero: Block = {
    slug: 'ImageHero',
    fields: [upload('image'), { name: 'heading', type: 'text' }],
  }
  const Logos: Block = {
    slug: 'Logos',
    fields: [{ name: 'items', type: 'array', fields: [upload('logo')] }],
  }

  it("resolves a row by the field's own blocks, and marks it viaBlock", () => {
    const fields: Field[] = [{ name: 'layout', type: 'blocks', blocks: [ImageHero] }]
    expect(
      referencesIn(fields, { layout: [{ blockType: 'ImageHero', image: 8 }] }, opts()),
    ).toEqual([{ id: 8, path: 'layout[0] › ImageHero › image', viaBlock: true }])
  })

  it('resolves blockReferences through the registry', () => {
    const fields: Field[] = [
      { name: 'layout', type: 'blocks', blocks: [], blockReferences: ['Logos'] },
    ]
    const data = { layout: [{ blockType: 'Logos', items: [{ logo: 1 }, { logo: 2 }] }] }
    const refs = referencesIn(fields, data, opts([Logos]))
    expect(refs.map((r) => r.id)).toEqual([1, 2])
    expect(refs.every((r) => r.viaBlock)).toBe(true)
  })

  it('accepts the registry as a map', () => {
    const fields: Field[] = [{ name: 'layout', type: 'blocks', blocks: [] }]
    const refs = referencesIn(
      fields,
      { layout: [{ blockType: 'ImageHero', image: 8 }] },
      {
        collection: 'media',
        blocks: new Map([['ImageHero', ImageHero]]),
      },
    )
    expect(refs).toHaveLength(1)
  })

  it('skips a row whose blockType names no known block, rather than guessing', () => {
    const fields: Field[] = [{ name: 'layout', type: 'blocks', blocks: [ImageHero] }]
    expect(
      referencesIn(fields, { layout: [{ blockType: 'NoSuchComponent', image: 8 }] }, opts()),
    ).toEqual([])
  })

  it('separates a block reference from a field reference on the same document', () => {
    const fields: Field[] = [
      upload('heroImage'),
      { name: 'layout', type: 'blocks', blocks: [ImageHero] },
    ]
    const data = { heroImage: 1, layout: [{ blockType: 'ImageHero', image: 2 }] }
    expect(referencesIn(fields, data, opts()).map((r) => [r.id, r.viaBlock])).toEqual([
      [1, false],
      [2, true],
    ])
  })
})

describe('referencesTo', () => {
  it('filters to one id, comparing as strings', () => {
    const fields: Field[] = [upload('a'), upload('b')]
    expect(referencesTo(fields, { a: 3, b: 4 }, { ...opts(), id: '3' })).toEqual([
      { id: 3, path: 'a', viaBlock: false },
    ])
    expect(referencesTo([upload('a')], { a: 3 }, { ...opts(), id: 99 })).toEqual([])
  })
})

describe('couldReference', () => {
  it('is true for a field pointing at the collection, however deep', () => {
    const fields: Field[] = [
      {
        type: 'tabs',
        tabs: [{ label: 'x', fields: [{ name: 'g', type: 'group', fields: [upload('i')] }] }],
      },
    ]
    expect(couldReference(fields, 'media')).toBe(true)
  })

  it('is true for blocks and rich text, which can hold anything', () => {
    expect(couldReference([{ name: 'layout', type: 'blocks', blocks: [] }], 'media')).toBe(true)
    expect(couldReference([{ name: 'body', type: 'richText' }], 'media')).toBe(true)
  })

  it('is false for a collection that cannot', () => {
    const fields: Field[] = [
      { name: 'from', type: 'text' },
      { name: 'doc', type: 'upload', relationTo: 'documents' },
    ]
    expect(couldReference(fields, 'media')).toBe(false)
  })
})

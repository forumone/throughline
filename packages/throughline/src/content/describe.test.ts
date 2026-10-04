import type { Block, Field, PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'
import {
  describeFields,
  topLevelFields,
  unknownFieldNames,
  writableFields,
  type DescribeContext,
} from './describe.js'

/*
The shape of a real content collection, cut down: fields in unnamed tabs, a
sidebar slug, an SEO group with a `ui` preview in it, a blocks field narrowed by
`filterOptions`, and the system fields an author never sets.
*/

const hero: Block = {
  slug: 'ImageHero',
  labels: { singular: 'Image Hero', plural: 'Image Heroes' },
  admin: { group: 'Hero' },
  fields: [],
}
const cta: Block = {
  slug: 'HighImpactCTA',
  labels: { singular: 'High Impact CTA', plural: 'High Impact CTAs' },
  fields: [],
}
const quote: Block = { slug: 'Quote', fields: [] }

const fields: Field[] = [
  {
    type: 'tabs',
    tabs: [
      {
        label: 'Content',
        fields: [
          { name: 'title', type: 'text', required: true, maxLength: 120, label: 'Title' },
          {
            name: 'layout',
            type: 'blocks',
            maxRows: 40,
            blocks: [hero, cta],
            blockReferences: ['Quote'],
            filterOptions: ({ siblingData }) => {
              const held = ((siblingData as { layout?: { blockType: string }[] }).layout ?? []).map(
                (row) => row.blockType,
              )
              return ['HighImpactCTA', 'Quote', ...held]
            },
          },
          {
            name: 'stats',
            type: 'array',
            maxRows: 4,
            fields: [
              { name: 'value', type: 'text', required: true },
              { name: 'id', type: 'text', admin: { hidden: true } },
            ],
          },
        ],
      },
      {
        label: 'SEO',
        fields: [
          {
            name: 'meta',
            type: 'group',
            fields: [
              { name: 'overview', type: 'ui', admin: { components: {} } },
              { name: 'title', type: 'text' },
              {
                name: 'description',
                type: 'textarea',
                admin: { description: 'Shown in search results.' },
              },
              { name: 'image', type: 'upload', relationTo: 'media' },
            ],
          },
        ],
      },
    ],
  },
  { name: 'slug', type: 'text', required: true, admin: { position: 'sidebar' } },
  { name: 'authors', type: 'relationship', relationTo: 'people', hasMany: true },
  { name: 'kind', type: 'select', options: ['news', { label: 'Opinion', value: 'opinion' }] },
  {
    type: 'collapsible',
    label: 'Narration',
    fields: [{ name: 'narration', type: 'group', admin: { readOnly: true }, fields: [] }],
  },
  { name: 'revisedAt', type: 'date', admin: { readOnly: true } },
]

const ctx: DescribeContext = {
  blocks: new Map([['Quote', quote]]),
  req: {} as PayloadRequest,
  findWith: new Map([
    ['people', 'people'],
    ['media', 'media'],
  ]),
}

describe('topLevelFields', () => {
  it('looks through unnamed tabs and collapsibles to the names a document is stored under', () => {
    expect(topLevelFields(fields).map((f) => ('name' in f ? f.name : f.type))).toEqual([
      'title',
      'layout',
      'stats',
      'meta',
      'slug',
      'authors',
      'kind',
      'narration',
      'revisedAt',
    ])
  })

  it('treats a named tab as the group it is stored as', () => {
    const named: Field[] = [
      { type: 'tabs', tabs: [{ name: 'hero', fields: [{ name: 'heading', type: 'text' }] }] },
    ]
    expect(topLevelFields(named)).toMatchObject([{ name: 'hero', type: 'group' }])
  })
})

describe('writableFields and unknownFieldNames', () => {
  it('keeps only the allow-listed fields, in the order the admin shows them', () => {
    const names = writableFields(fields, ['slug', 'title', 'meta']).map((f) =>
      'name' in f ? f.name : '',
    )
    expect(names).toEqual(['title', 'meta', 'slug'])
  })

  it('names what is not a top-level field, including one only inside a group', () => {
    expect(unknownFieldNames(fields, ['title', 'tittle', 'description'])).toEqual([
      'tittle',
      'description',
    ])
  })
})

describe('describeFields', () => {
  it('describes types, limits, required, options and labels from the config', async () => {
    const out = await describeFields(writableFields(fields, ['title', 'kind', 'stats']), ctx)
    expect(out).toEqual([
      { name: 'title', type: 'text', label: 'Title', required: true, maxLength: 120 },
      {
        name: 'stats',
        type: 'array',
        maxRows: 4,
        fields: [{ name: 'value', type: 'text', required: true }],
      },
      { name: 'kind', type: 'select', options: ['news', 'opinion'] },
    ])
  })

  it('leaves out ui fields and keeps the admin description', async () => {
    const [meta] = await describeFields(writableFields(fields, ['meta']), ctx)
    expect(meta?.fields?.map((f) => f.name)).toEqual(['title', 'description', 'image'])
    expect(meta?.fields?.[1]).toMatchObject({ description: 'Shown in search results.' })
  })

  it('says which find_related kind finds a link target', async () => {
    const out = await describeFields(writableFields(fields, ['authors', 'meta']), ctx)
    expect(out.find((f) => f.name === 'authors')).toMatchObject({
      relationTo: 'people',
      hasMany: true,
      findWith: 'people',
    })
    expect(out.find((f) => f.name === 'meta')?.fields?.[2]).toMatchObject({
      type: 'upload',
      findWith: 'media',
    })
  })

  it("offers only the blocks the field's own filterOptions offers to an empty document", async () => {
    const [layout] = await describeFields(writableFields(fields, ['layout']), ctx)
    expect(layout).toMatchObject({ name: 'layout', type: 'blocks', maxRows: 40 })
    expect(layout?.blocks).toEqual([
      { slug: 'HighImpactCTA', label: 'High Impact CTA' },
      { slug: 'Quote' },
    ])
  })

  it('offers every block when the field has no filterOptions, resolving references by slug', async () => {
    const open: Field = { name: 'layout', type: 'blocks', blocks: [hero], blockReferences: ['Quote'] }
    const [layout] = await describeFields([open], ctx)
    expect(layout?.blocks).toEqual([
      { slug: 'ImageHero', label: 'Image Hero', group: 'Hero' },
      { slug: 'Quote' },
    ])
  })

  it('leaves out read-only and hidden fields even when allow-listed', async () => {
    const out = await describeFields(writableFields(fields, ['narration', 'revisedAt']), ctx)
    expect(out).toEqual([])
  })
})

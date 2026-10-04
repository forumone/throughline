import type { Block, Field } from 'payload'
import { describe, expect, it } from 'vitest'
import { linkField } from '@forumone/throughline-design-system/generate'
import { LINK_TARGET_KEY, linkTargetsIn, markLinkTarget } from './links.js'

/*
Where a document's links go, for the `link-targets` publish step
(forumone-2026#756). A link is a marked relationship or a Lexical internal
link; any other relationship is not one, and must not be reported as one.
*/

/** The shape the design-system generator builds, marked the way it marks it. */
const link = (name: string): Field => ({
  name,
  type: 'group',
  fields: [
    { name: 'mode', type: 'radio', options: ['internal', 'external', 'anchor'] },
    markLinkTarget({ name: 'reference', type: 'relationship', relationTo: ['pages', 'posts'] }),
    { name: 'url', type: 'text' },
  ],
})

const summary = (fields: readonly Field[], data: Record<string, unknown>, blocks?: Block[]) =>
  linkTargetsIn(fields, data, blocks ? { blocks } : {}).map((t) => ({
    relationTo: t.relationTo,
    id: t.id,
    source: t.source,
    dataPath: t.at.dataPath,
    block: t.at.block ? `${t.at.block.index}:${t.at.block.block.slug}` : undefined,
    top: t.at.top?.name,
  }))

describe('a marked relationship', () => {
  it('is a link, polymorphic or not', () => {
    const fields: Field[] = [
      link('cta'),
      markLinkTarget({ name: 'page', type: 'relationship', relationTo: 'pages' }),
    ]
    const data = {
      cta: { mode: 'internal', reference: { relationTo: 'posts', value: 7 } },
      page: 3,
    }
    expect(summary(fields, data)).toEqual([
      {
        relationTo: 'posts',
        id: 7,
        source: 'field',
        dataPath: 'cta.reference',
        block: undefined,
        top: 'cta',
      },
      {
        relationTo: 'pages',
        id: 3,
        source: 'field',
        dataPath: 'page',
        block: undefined,
        top: 'page',
      },
    ])
  })

  it('reads a populated value as well as a bare id', () => {
    const data = { cta: { reference: { relationTo: 'pages', value: { id: 9, title: 'About' } } } }
    expect(summary([link('cta')], data).map((t) => t.id)).toEqual([9])
  })

  it('counts with no mode, which the renderer reads as internal', () => {
    expect(
      summary([link('cta')], { cta: { reference: { relationTo: 'pages', value: 1 } } }),
    ).toHaveLength(1)
  })

  it('is skipped when the link goes somewhere else, though the old reference is still stored', () => {
    const data = {
      cta: {
        mode: 'external',
        url: 'https://example.com',
        reference: { relationTo: 'pages', value: 1 },
      },
    }
    expect(summary([link('cta')], data)).toEqual([])
  })

  it('takes a host’s own rule for which branch is live', () => {
    const fields: Field[] = [
      {
        name: 'link',
        type: 'group',
        fields: [
          { name: 'type', type: 'radio', options: ['reference', 'custom'] },
          markLinkTarget(
            { name: 'reference', type: 'relationship', relationTo: 'pages' },
            { when: (siblings) => siblings['type'] === 'reference' },
          ),
        ],
      },
    ]
    expect(summary(fields, { link: { type: 'custom', reference: 1 } })).toEqual([])
    expect(summary(fields, { link: { type: 'reference', reference: 1 } })).toHaveLength(1)
  })

  it('is found inside a block, with the block and the data path the admin marks', () => {
    const CardGrid: Block = {
      slug: 'CardGrid',
      fields: [{ name: 'items', type: 'array', fields: [link('href')] }],
    }
    const fields: Field[] = [{ name: 'layout', type: 'blocks', blocks: [CardGrid] }]
    const data = {
      layout: [
        { blockType: 'CardGrid', items: [] },
        {
          blockType: 'CardGrid',
          items: [{}, { href: { reference: { relationTo: 'pages', value: 4 } } }],
        },
      ],
    }
    expect(summary(fields, data)).toEqual([
      {
        relationTo: 'pages',
        id: 4,
        source: 'field',
        dataPath: 'layout[1].items[1].href.reference',
        block: '1:CardGrid',
        top: 'layout',
      },
    ])
  })

  it('recognises the link the design-system generator builds', () => {
    // The marker is written out in that package, which cannot import the key from this one.
    const fields = [linkField('href', { linkCollections: ['pages'] } as never)]
    const data = { href: { mode: 'internal', reference: { relationTo: 'pages', value: 2 } } }
    expect(summary(fields, data).map((t) => t.id)).toEqual([2])
  })
})

describe('what is not a link', () => {
  it('ignores an unmarked relationship, such as an author', () => {
    const fields: Field[] = [
      { name: 'author', type: 'relationship', relationTo: 'people' },
      { name: 'related', type: 'relationship', relationTo: 'posts', hasMany: true },
    ]
    expect(summary(fields, { author: 1, related: [2, 3] })).toEqual([])
  })

  it('ignores a marker on a field that is not a relationship', () => {
    const fields: Field[] = [{ name: 'url', type: 'text', custom: { [LINK_TARGET_KEY]: true } }]
    expect(summary(fields, { url: '/about' })).toEqual([])
  })
})

describe('rich text', () => {
  const fields: Field[] = [{ name: 'body', type: 'richText', label: 'Body' }]
  const linkNode = (fields: Record<string, unknown>, type = 'link') => ({
    type,
    fields,
    children: [],
  })

  it('finds an internal link and an internal autolink, by id or populated', () => {
    const body = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              linkNode({ linkType: 'internal', doc: { relationTo: 'pages', value: 5 } }),
              linkNode(
                { linkType: 'internal', doc: { relationTo: 'posts', value: { id: 6 } } },
                'autolink',
              ),
            ],
          },
        ],
      },
    }
    expect(summary(fields, { body })).toEqual([
      {
        relationTo: 'pages',
        id: 5,
        source: 'richText',
        dataPath: 'body',
        block: undefined,
        top: 'body',
      },
      {
        relationTo: 'posts',
        id: 6,
        source: 'richText',
        dataPath: 'body',
        block: undefined,
        top: 'body',
      },
    ])
  })

  it('ignores a custom URL and an embedded relationship', () => {
    const body = {
      root: {
        children: [
          linkNode({ linkType: 'custom', url: 'https://example.com' }),
          { type: 'relationship', relationTo: 'pages', value: 1 },
        ],
      },
    }
    expect(summary(fields, { body })).toEqual([])
  })

  it('finds a link in rich text inside a block, at the rich-text field’s path', () => {
    const Text: Block = { slug: 'Text', fields: [{ name: 'content', type: 'richText' }] }
    const layout: Field[] = [{ name: 'layout', type: 'blocks', blocks: [Text] }]
    const content = {
      root: {
        children: [linkNode({ linkType: 'internal', doc: { relationTo: 'pages', value: 8 } })],
      },
    }
    expect(summary(layout, { layout: [{ blockType: 'Text', content }] })).toEqual([
      {
        relationTo: 'pages',
        id: 8,
        source: 'richText',
        dataPath: 'layout[0].content',
        block: '0:Text',
        top: 'layout',
      },
    ])
  })

  it('finds a marked link inside a Lexical block, keeping the rich-text field’s path', () => {
    const Button: Block = { slug: 'Button', fields: [link('href')] }
    const body = {
      root: {
        children: [
          {
            type: 'block',
            fields: { blockType: 'Button', href: { reference: { relationTo: 'pages', value: 3 } } },
          },
        ],
      },
    }
    expect(summary(fields, { body }, [Button])).toEqual([
      {
        relationTo: 'pages',
        id: 3,
        source: 'field',
        dataPath: 'body',
        block: undefined,
        top: 'body',
      },
    ])
  })
})

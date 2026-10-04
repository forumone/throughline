import type { Block, Field } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { checkValues, linkShape, valueRefusal, valueShapes } from './values.js'

/*
A write's values, at every depth, in the shape their fields take.
forumone-2026#832: a link sent as a string was saved as an empty link, and
Markdown in an accordion item was stored as an object that renders nothing,
both as success.
*/

const link: Field = {
  name: 'ctaHref',
  type: 'group',
  fields: [
    { name: 'mode', type: 'select', options: ['internal', 'external'] },
    { name: 'url', type: 'text' },
    { name: 'reference', type: 'relationship', relationTo: ['pages', 'posts'] },
    { name: 'newTab', type: 'checkbox' },
  ],
}
const accordion: Block = {
  slug: 'AccordionSection',
  fields: [
    { name: 'heading', type: 'text' },
    {
      name: 'items',
      type: 'array',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'content', type: 'richText' },
      ],
    },
  ],
}
// As the generator lays it out: the label and the link in an unnamed group, stored at the block's level.
const cta: Block = {
  slug: 'CTA',
  fields: [
    { name: 'heading', type: 'text' },
    { type: 'group', fields: [{ name: 'ctaLabel', type: 'text' }, link] } as Field,
  ],
}
const fields: Field[] = [
  { name: 'title', type: 'text' },
  { name: 'body', type: 'richText' },
  {
    name: 'meta',
    type: 'group',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'description', type: 'text' },
    ],
  },
  { name: 'layout', type: 'blocks', blocks: [cta, accordion] },
]
const registry = new Map<string, Block>()
const editorState = {
  root: {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hi' }] }],
  },
}

describe('a link', () => {
  it('sent as a string is refused, saying the shape, inside a block', async () => {
    const problems = await checkValues(
      fields,
      { layout: [{ blockType: 'CTA', ctaHref: '/contact' }] },
      { registry },
    )
    expect(problems).toEqual([
      {
        path: 'layout[0].ctaHref',
        message: expect.stringContaining(
          '{ mode: "external", url: "https://…" }, or { mode: "internal", reference: { relationTo: "pages | posts", value: <id> } }',
        ),
      },
    ])
    expect(valueRefusal(problems).error).toMatch(
      /^A value is not in the shape its field takes\. Nothing was saved\./,
    )
  })

  it('as an object passes', async () => {
    const data = {
      layout: [{ blockType: 'CTA', ctaHref: { mode: 'external', url: 'https://example.org' } }],
    }
    expect(await checkValues(fields, data, { registry })).toEqual([])
  })

  it('is recognised by its fields, and an ordinary group is not one', () => {
    expect(linkShape(link)).toContain('mode: "internal"')
    expect(linkShape(fields[2]!)).toBeUndefined()
  })
})

describe('rich text below the top level', () => {
  const data = () => ({
    layout: [
      {
        blockType: 'AccordionSection',
        items: [{ title: 'Q', content: { markdown: 'An **answer**.' } }],
      },
    ],
  })

  it("is converted in place by the site's converter", async () => {
    const convert = vi.fn(async () => ({ state: editorState }))
    const d = data()
    expect(await checkValues(fields, d, { registry, blockRichText: convert })).toEqual([])
    expect(convert).toHaveBeenCalledWith({ markdown: 'An **answer**.' })
    expect(d.layout[0]!.items[0]!.content).toBe(editorState)
  })

  it('is refused, not stored as an object, when there is no converter', async () => {
    expect(await checkValues(fields, data(), { registry })).toEqual([
      {
        path: 'layout[0].items[0].content',
        message: expect.stringContaining('takes an editor state'),
      },
    ])
  })

  it('is refused when the converter would lose something, with its reason', async () => {
    const convert = vi.fn(async () => ({ refused: 'it holds an image.', details: { images: 1 } }))
    expect(await checkValues(fields, data(), { registry, blockRichText: convert })).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('it holds an image.'),
        details: { images: 1 },
      }),
    ])
  })

  it('as an editor state passes untouched, and a plain string is refused', async () => {
    const ok = { layout: [{ blockType: 'AccordionSection', items: [{ content: editorState }] }] }
    expect(await checkValues(fields, ok, { registry })).toEqual([])
    const bare = { layout: [{ blockType: 'AccordionSection', items: [{ content: 'An answer.' }] }] }
    expect(await checkValues(fields, bare, { registry, blockRichText: vi.fn() })).toHaveLength(1)
  })

  it('leaves top-level rich text to write.ts', async () => {
    expect(await checkValues(fields, { body: { markdown: 'x' } }, { registry })).toEqual([])
  })
})

describe('shapes', () => {
  it('refuses a group, a list, a row or a block in the wrong shape', async () => {
    const problems = await checkValues(
      fields,
      { meta: 'A title', layout: [{ blockType: 'AccordionSection', items: 'none' }, 'CTA'] },
      { registry },
    )
    expect(problems.map((p) => p.path)).toEqual(['meta', 'layout[0].items', 'layout[1]'])
  })

  it('are said up front for each kind of value', () => {
    expect(valueShapes({ blockRichText: true }).richtext).toContain('{ markdown: "…" }')
    expect(valueShapes({ blockRichText: false }).richtext).toContain('not a string or Markdown')
    expect(valueShapes({ blockRichText: false }).link).toContain('Never a plain string')
  })
})

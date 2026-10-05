import { ManifestSchema } from '@forumone/throughline-design-system/contract'
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { attachComponentValidator, makeContext } from '../_test-helpers.js'
import { COMPONENTS_MANIFEST_SYMBOL, compositionStep } from './composition.js'
import { emptyRequiredFields } from './required-in-blocks.js'

/*
A started block with a required field left empty does not publish, and
`check` says so before anybody tries. forumone-2026#840: an agent left a card
with no image (which also crashed the preview) and a form block with no form,
and `check` called the page ready.
*/

const base = {
  category: 'section',
  description: 'A list of work, each with an image.',
  intent: 'To show several pieces of work together.',
  composition: {
    placement: ['section'],
    maxPerPage: null,
    requiredSiblings: [],
    forbiddenAdjacent: [],
  },
  tokens: { consumes: [] },
  accessibility: {
    keyboardSupport: [],
    screenReaderBehavior: 'A list of linked items.',
    contentWarnings: [],
  },
  examples: [{ label: 'Default', intent: 'Several pieces of work', storyId: 'x--y' }],
  antiExamples: [{ label: 'Only one item', why: 'A list of one is a card, not a list.' }],
  behavior: {
    fetchesData: false,
    hasClientState: false,
    animates: false,
    requiresAnalytics: false,
  },
}

const manifest = ManifestSchema.parse({
  contractVersion: '1.1.0',
  designSystem: { name: 'ds', version: '1.0.0' },
  tokens: [],
  components: {
    FeaturedWork: {
      ...base,
      name: 'FeaturedWork',
      content: {
        fields: [
          { name: 'heading', type: 'text', required: false },
          { name: 'cta', type: 'link', required: true },
          {
            name: 'items',
            type: 'array',
            required: true,
            of: [
              { name: 'title', type: 'text', required: true },
              { name: 'image', type: 'image', required: true },
            ],
          },
          { name: 'omitted', type: 'text', required: true },
        ],
      },
    },
    ManagedForm: {
      ...base,
      name: 'ManagedForm',
      content: {
        fields: [
          { name: 'heading', type: 'text', required: false },
          {
            name: 'fields',
            type: 'array',
            required: true,
            of: [{ name: 'name', type: 'text', required: true }],
          },
        ],
      },
    },
  },
  build: { timestamp: '2026-10-04T00:00:00.000Z' },
})

/* The site's Payload blocks: `omitted` is left out of the CMS, `source.form` is
   the site's own, and the form's `fields` are hidden — filled at render. */
const blocks = [
  {
    slug: 'FeaturedWork',
    labels: { singular: 'Featured Work' },
    fields: [
      { name: 'heading', type: 'text' },
      {
        name: 'cta',
        type: 'group',
        fields: [
          { name: 'mode', type: 'radio' },
          { name: 'url', type: 'text' },
        ],
      },
      {
        name: 'items',
        type: 'array',
        labels: { singular: 'Item' },
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'image', type: 'upload', required: true },
        ],
      },
    ],
  },
  {
    slug: 'ManagedForm',
    labels: { singular: 'Form' },
    fields: [
      {
        name: 'source',
        type: 'group',
        label: 'The HubSpot form',
        fields: [{ name: 'form', type: 'relationship', required: true }],
      },
      { name: 'heading', type: 'text' },
      {
        name: 'fields',
        type: 'array',
        admin: { hidden: true },
        fields: [{ name: 'name', type: 'text' }],
      },
    ],
  },
]

async function run(layout: Record<string, unknown>[]) {
  const payload = {
    collections: {
      pages: {
        config: {
          fields: [
            { name: 'layout', type: 'blocks', blockReferences: ['FeaturedWork', 'ManagedForm'] },
          ],
        },
      },
    },
    config: { blocks },
  } as unknown as Payload
  attachComponentValidator(
    payload,
    vi.fn(async () => ({ valid: true, issues: [] })),
  )
  Object.defineProperty(payload, COMPONENTS_MANIFEST_SYMBOL, { value: async () => manifest })
  return compositionStep(makeContext({ payload, document: { layout } }))
}

const link = { mode: 'external', url: 'https://example.com' }

describe('a required field left empty inside a block', () => {
  it('refuses a card with no image, naming where it is', async () => {
    const result = await run([
      {
        blockType: 'FeaturedWork',
        heading: 'Our work',
        cta: link,
        items: [
          { title: 'One', image: 4 },
          { title: 'Two', image: null },
        ],
      },
    ])
    expect(result.pass).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        rule: 'required-field',
        field: 'layout[0].items[1].image',
        message:
          'Block 1 (Featured Work) › Item 2 › Image is required before this can be published.',
      }),
    ])
  })

  it('refuses a form block with no form, a field the site added', async () => {
    const result = await run([
      { blockType: 'ManagedForm', heading: 'Get in touch', source: { form: null } },
    ])
    expect(result.issues).toEqual([
      expect.objectContaining({ rule: 'required-field', field: 'layout[0].source.form' }),
    ])
  })

  it('holds a link to the contract’s required, which a generated link enforces by validate', async () => {
    const result = await run([
      {
        blockType: 'FeaturedWork',
        heading: 'Our work',
        cta: { mode: 'internal' },
        items: [{ title: 'One', image: 4 }],
      },
    ])
    expect(result.issues?.map((issue) => issue.field)).toEqual(['layout[0].cta'])
  })

  it('passes a finished block, and ignores what the site left out or hid', async () => {
    const result = await run([
      { blockType: 'FeaturedWork', cta: link, items: [{ title: 'One', image: 4 }] },
      { blockType: 'ManagedForm', source: { form: 12 } },
    ])
    expect(result.pass).toBe(true)
  })

  it('leaves an untouched block to the empty-block rule', async () => {
    const result = await run([{ blockType: 'FeaturedWork', items: [] }])
    expect(result.issues?.map((issue) => issue.rule)).toEqual(['empty-block'])
  })
})

describe('emptyRequiredFields', () => {
  const fields = [
    { name: 'stat', type: 'group', fields: [{ name: 'value', type: 'text', required: true }] },
    { name: 'related', type: 'group', fields: [{ name: 'href', type: 'group', fields: [] }] },
    { name: 'rows', type: 'array', fields: [{ name: 'label', type: 'text', required: true }] },
  ]
  const contract = [
    { name: 'related', of: [{ name: 'href', required: true }] },
    { name: 'rows', of: [{ name: 'label', required: true }] },
  ]

  it('follows Payload into an empty optional group or row, as its publish would', () => {
    expect(emptyRequiredFields(fields, contract, { stat: {}, rows: [{ id: 'a' }] }, 'b')).toEqual([
      'b.stat.value',
      'b.rows[0].label',
    ])
  })

  it('does not hold an empty optional group to the contract alone', () => {
    expect(
      emptyRequiredFields(fields, contract, { stat: { value: '1' }, related: {} }, 'b'),
    ).toEqual([])
    expect(
      emptyRequiredFields(fields, contract, { stat: { value: '1' }, related: { other: 'x' } }, 'b'),
    ).toEqual(['b.related.href'])
  })
})

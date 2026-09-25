import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'
import { generateBlock, type GenerateOptions, type ManifestComponent } from './blocks'
import type { ContentField } from './fields'
import { labelFor, pairTitle } from './labels'

/*
The arrangement pass, asked what an author would see.

The property everything here leans on is that none of it moves data: every
wrapper it adds is an unnamed group or a collapsible, which Payload stores
flat. So the first assertion is that the *named* fields of a block — the ones
that become columns in `payload-types.ts` and keys in the stored JSON — are
exactly the contract's, in the contract's order, whatever the drawing does.
*/

const options: GenerateOptions = {
  manifest: { components: {} },
  overrides: {},
  mediaCollection: 'media',
  linkCollections: ['pages'],
  resolveSelectOptions: () => ['a', 'b'],
  resolveNamedOptions: () => null,
}

function component(fields: ContentField[]): ManifestComponent {
  return {
    name: 'Example',
    category: 'section',
    description: '',
    intent: '',
    composition: {
      placement: ['section'],
      maxPerPage: null,
      requiredSiblings: [],
      forbiddenAdjacent: [],
    },
    content: { fields },
  }
}

const f = (name: string, type: ContentField['type'], extra: Partial<ContentField> = {}) =>
  ({ name, type, required: false, ...extra }) as ContentField

type Shaped = Field & { name?: string; label?: unknown; fields?: Field[]; admin?: Record<string, unknown> }

/** The data-bearing names at the level a block stores, seen through wrappers. */
function storedNames(fields: Field[]): string[] {
  return (fields as Shaped[]).flatMap(field =>
    field.name ? [field.name] : storedNames(field.fields ?? []),
  )
}

const TEXT_HERO = [
  f('heading', 'text'),
  f('subheading', 'text'),
  f('description', 'text'),
  f('ctaLabel', 'text', { constraints: 'What the button says.' }),
  f('ctaHref', 'link', { constraints: 'Where the button goes.' }),
]

describe('arranging a block', () => {
  it('stores exactly the contract’s fields, in order, whatever it draws', () => {
    const contract = [
      f('headingLevel', 'select'),
      ...TEXT_HERO,
      f('variant', 'select'),
      f('pauseLabel', 'text', { advanced: true }),
    ]
    const block = generateBlock(component(contract), options)
    expect(storedNames(block.fields).sort()).toEqual(contract.map(c => c.name).sort())
  })

  it('draws a label and its link as one group, headed by what they are', () => {
    const block = generateBlock(component(TEXT_HERO), options)
    const fields = block.fields as Shaped[]

    expect(fields.map(field => field.name ?? field.label)).toEqual([
      'heading',
      'subheading',
      'description',
      'Call to action',
    ])

    const pair = fields[3] as Shaped
    expect(pair.type).toBe('group')
    expect(pair.name).toBeUndefined()
    expect(pair.admin?.description).toBe('Where the button goes.')

    const [label, link] = pair.fields as Shaped[]
    expect(label?.name).toBe('ctaLabel')
    expect(label?.label).toBe('Label')
    expect(link?.name).toBe('ctaHref')
    // The pair's heading already names it; a second "CTA link" heading inside
    // the first is the clutter this exists to remove.
    expect(link?.label).toBe(false)
  })

  it('pairs in either order, at the position of whichever comes first', () => {
    const block = generateBlock(
      component([f('heading', 'text'), f('linkedinHref', 'link'), f('linkedinLabel', 'text'), f('footnote', 'text')]),
      options,
    )
    const fields = block.fields as Shaped[]
    expect(fields.map(field => field.name ?? field.label)).toEqual([
      'heading',
      'LinkedIn link',
      'footnote',
    ])
    expect((fields[1]?.fields as Shaped[]).map(child => child.name)).toEqual([
      'linkedinLabel',
      'linkedinHref',
    ])
  })

  it('pairs inside array rows too', () => {
    const block = generateBlock(
      component([
        f('items', 'array', {
          of: [f('title', 'text', { required: true }), f('actionLabel', 'text'), f('actionHref', 'link')],
        }),
      ]),
      options,
    )
    const rows = (block.fields[0] as Shaped).fields as Shaped[]
    expect(rows.map(field => field.name ?? field.label)).toEqual(['title', 'Action link'])
  })

  it('does not pair a link the component fills in itself', () => {
    const block = generateBlock(
      component([f('copyLabel', 'text'), f('copyUrl', 'link', { advanced: true })]),
      options,
    )
    const fields = block.fields as Shaped[]
    expect(fields.map(field => field.name ?? field.label)).toEqual(['copyLabel', 'More options'])
  })

  it('leaves a bare label, or a bare link, where it is', () => {
    const block = generateBlock(
      component([f('calendarLabel', 'text'), f('href', 'link'), f('heading', 'text')]),
      options,
    )
    expect((block.fields as Shaped[]).map(field => field.name)).toEqual(['calendarLabel', 'href', 'heading'])
  })

  it('moves settings and advanced copy into one collapsed section at the end', () => {
    const block = generateBlock(
      component([
        f('headingLevel', 'select'),
        f('heading', 'text'),
        f('numCols', 'number'),
        f('items', 'array', { of: [f('isOpen', 'boolean'), f('title', 'text')] }),
        f('playLabel', 'text', { advanced: true }),
      ]),
      options,
    )
    const fields = block.fields as Shaped[]
    expect(fields.map(field => field.name ?? field.label)).toEqual(['heading', 'items', 'More options'])

    const more = fields[2] as Shaped
    expect(more.type).toBe('collapsible')
    expect(more.admin?.initCollapsed).toBe(true)
    expect((more.fields as Shaped[]).map(child => child.name)).toEqual([
      'headingLevel',
      'numCols',
      'playLabel',
    ])

    // Rows are left alone: a closed section per card is a click per card.
    const row = (fields[1] as Shaped).fields as Shaped[]
    expect(row.map(child => child.name)).toEqual(['isOpen', 'title'])
  })

  it('never tucks a required field away, whatever its type', () => {
    const block = generateBlock(
      component([f('heading', 'text'), f('variant', 'select', { required: true })]),
      options,
    )
    expect((block.fields as Shaped[]).map(field => field.name ?? field.label)).toEqual([
      'heading',
      'variant',
    ])
  })

  it('adds no section to a block with nothing to put in it', () => {
    const block = generateBlock(component(TEXT_HERO), options)
    expect((block.fields as Shaped[]).some(field => field.type === 'collapsible')).toBe(false)
  })
})

describe('labels', () => {
  it.each([
    ['ctaLabel', 'text', 'CTA label'],
    ['primaryCtaHref', 'link', 'Primary CTA link'],
    ['imageAlt', 'text', 'Image alt text'],
    ['alt', 'text', 'Alt text'],
    ['src', 'image', 'Image'],
    ['src', 'video', 'Video URL'],
    ['videoSrc', 'video', 'Background video'],
    ['logoSrc', 'image', 'Logo image'],
    ['isOpen', 'boolean', 'Open on page load'],
    ['numCols', 'number', 'Columns'],
    ['headingLevel', 'select', 'Heading level'],
    ['subscriptionTypeId', 'number', 'Subscription type ID'],
    ['children', 'text', 'Text'],
  ] as const)('%s (%s) reads as “%s”', (name, type, label) => {
    expect(labelFor({ name, type })).toBe(label)
  })

  it.each([
    ['cta', 'Call to action'],
    ['primaryCta', 'Primary call to action'],
    ['viewAll', 'View all link'],
    ['link', 'Link'],
    ['register', 'Register link'],
  ])('a %s pair is headed “%s”', (prefix, title) => {
    expect(pairTitle(prefix)).toBe(title)
  })
})

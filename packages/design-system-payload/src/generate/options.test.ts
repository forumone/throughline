import { describe, expect, it } from 'vitest'
import { generateBlock, type GenerateOptions, type ManifestComponent } from './blocks'
import { groupLabel, optionLabel, selectDescription } from './labels'

/*
What an author reads in a dropdown, on a picker shelf, and under a select.
The description cases are real contract sentences.
*/

describe('an option', () => {
  it.each([
    ['h2', 'Heading 2'],
    ['p', 'Paragraph'],
    ['tel', 'Phone number'],
    ['textarea', 'Long text'],
    ['bar-chart', 'Bar chart'],
    ['ArrowRightLong', 'Arrow right long'],
    ['on-dark', 'On dark'],
    ['Linkedin', 'LinkedIn'],
    ['default', 'Default'],
    ['16:9', '16:9'],
  ])('%s reads as “%s”', (value, label) => {
    expect(optionLabel(value)).toBe(label)
  })

  it("takes the host's word first, for a value that only means something in its design system", () => {
    expect(optionLabel('text-image', { 'text-image': 'Text and image' })).toBe('Text and image')
    expect(optionLabel('h2', { h2: 'Section heading' })).toBe('Section heading')
  })
})

describe('a shelf', () => {
  it('spells an acronym the way a field label does', () => {
    expect(groupLabel('cta')).toBe('CTA')
    expect(groupLabel('listing')).toBe('Listing')
  })
})

describe("a select's description", () => {
  const levels = ['h2', 'h3', 'h4']

  it('drops the sentences that only listed the options, and keeps the advice', () => {
    expect(selectDescription('h2 | h3 | h4. Pick the level that fits the page outline.', levels)).toBe(
      'Pick the level that fits the page outline.',
    )
  })

  it('keeps the default a dropped sentence named, because the dropdown opens empty', () => {
    expect(
      selectDescription('h2 | h3 | h4. Defaults to h3. Pick the level that fits the page outline.', levels),
    ).toBe('Leave empty for Heading 3. Pick the level that fits the page outline.')
    expect(
      selectDescription("'text-image' (default) or 'two-image'.", ['text-image', 'two-image'], value =>
        value === 'text-image' ? 'Text and image' : value,
      ),
    ).toBe('Leave empty for Text and image.')
  })

  it('starts a clause that followed a dropped semicolon with a capital', () => {
    expect(selectDescription('h2 | h3 | h4. Defaults to h3; match the surrounding outline.', levels)).toBe(
      'Leave empty for Heading 3. Match the surrounding outline.',
    )
  })

  it('is nothing at all when listing the options was all it did', () => {
    expect(selectDescription("'default' or 'small'.", ['default', 'small'])).toBeUndefined()
  })

  it('does not take "e.g." for the end of a sentence', () => {
    expect(
      selectDescription('Name of a glyph in the global icon set, e.g. "MessageCircle". Omit for no icon.', [
        'MessageCircle',
        'Users',
      ]),
    ).toBe('Name of a glyph in the global icon set, e.g. "MessageCircle". Omit for no icon.')
  })

  it('keeps a sentence that explains what the options mean', () => {
    const text = "'default' (the bare card) or 'panel' (the card on a white tile)."
    expect(selectDescription(text, ['default', 'panel'])).toBe(text)
  })

  it('keeps a sentence that mentions a value in passing', () => {
    expect(
      selectDescription("Use 'p' when the section already has a heading and this is purely decorative.", [
        'h1',
        'h2',
        'p',
      ]),
    ).toBe("Use 'p' when the section already has a heading and this is purely decorative.")
  })

  it('reads a value inside a longer word as part of that word', () => {
    // "h2" is in "h2-heavy" and "default" is in "defaults"; neither is a value here.
    expect(selectDescription('Avoid h2-heavy pages.', levels)).toBe('Avoid h2-heavy pages.')
  })
})

const options: GenerateOptions = {
  manifest: { components: {} },
  overrides: { AtAGlance: { label: 'At a Glance' } },
  mediaCollection: 'media',
  linkCollections: ['pages'],
  resolveSelectOptions: (_component, path) => (path === 'headingLevel' ? ['h2', 'h3'] : null),
  resolveNamedOptions: () => null,
  optionLabels: { h3: 'Subsection heading' },
  resolvePreview: component => ({ url: `/${component}.webp` }),
}

function component(name: string): ManifestComponent {
  return {
    name,
    category: 'section',
    group: 'cta',
    description: '',
    intent: '',
    composition: { placement: ['section'], maxPerPage: null, requiredSiblings: [], forbiddenAdjacent: [] },
    content: {
      fields: [
        {
          name: 'headingLevel',
          type: 'select',
          required: false,
          constraints: 'h2 | h3. Defaults to h2. Match the page outline.',
        },
      ],
    },
  }
}

describe('a generated block', () => {
  const block = generateBlock(component('HighImpactCTA'), options)
  type Node = { name?: string; fields?: Node[]; options?: unknown; admin?: { description?: string } }
  // `arrange` tucks a setting like this behind "More options", so find it by name.
  const find = (nodes: Node[]): Node | undefined =>
    nodes.find(node => node.name === 'headingLevel') ??
    nodes.map(node => find(node.fields ?? [])).find(Boolean)
  const select = find(block.fields as Node[])!

  it('labels every option, preferring the host vocabulary', () => {
    expect(select.options).toEqual([
      { label: 'Heading 2', value: 'h2' },
      { label: 'Subsection heading', value: 'h3' },
    ])
    expect(select.admin?.description).toBe('Leave empty for Heading 2. Match the page outline.')
  })

  it('sits on a shelf whose acronym is spelled out', () => {
    expect(block.admin?.group).toBe('CTA')
  })

  it("describes its preview by its label, not its slug", () => {
    expect(block.imageAltText).toBe('A preview of the High Impact CTA block')
  })

  it('takes a label override where splitting the name reads wrong, and keeps its slug', () => {
    const glance = generateBlock(component('AtAGlance'), options)
    expect(glance.slug).toBe('AtAGlance')
    expect(glance.labels).toEqual({ singular: 'At a Glance', plural: 'At a Glance' })
  })
})

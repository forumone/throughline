import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'
import { generateBlock, type GenerateOptions, type ManifestComponent } from './blocks'
import { blockGuidance } from './guidance'

const NAMES = ['ImageHero', 'IntroSection', 'HighImpactCTA', 'CTA']

describe("a block's guidance", () => {
  it("is the intent's first sentence, which is the one written for an author", () => {
    expect(
      blockGuidance(
        'Use once per page as the strongest possible prompt, normally just above the footer. Its scale is meant to interrupt the page.',
        NAMES,
      ),
    ).toBe('Use once per page as the strongest possible prompt, normally just above the footer.')
  })

  it('names another component the way the picker labels it', () => {
    expect(
      blockGuidance('Use exactly where you would use ImageHero — the first element. More.', NAMES),
    ).toBe('Use exactly where you would use Image Hero — the first element.')
  })

  it('leaves a capitalised word alone when it is not a component', () => {
    expect(blockGuidance('Use for a HubSpot form rendered in YouTube markup.', NAMES)).toBe(
      'Use for a HubSpot form rendered in YouTube markup.',
    )
  })

  it('does not split on a sentence that does not end', () => {
    expect(blockGuidance('Use as the first element of the homepage', NAMES)).toBe(
      'Use as the first element of the homepage',
    )
    expect(blockGuidance('', NAMES)).toBe('')
  })
})

const options: GenerateOptions = {
  manifest: { components: Object.fromEntries(NAMES.map(name => [name, {} as ManifestComponent])) },
  overrides: {},
  mediaCollection: 'media',
  linkCollections: ['pages'],
  resolveSelectOptions: () => null,
  resolveNamedOptions: () => null,
}

function component(intent: string): ManifestComponent {
  return {
    name: 'Example',
    category: 'section',
    description: '',
    intent,
    composition: { placement: ['section'], maxPerPage: null, requiredSiblings: [], forbiddenAdjacent: [] },
    content: { fields: [{ name: 'heading', type: 'text', required: false }] },
  }
}

type Shaped = Field & { name?: string; admin?: { components?: { Field?: unknown } } }

describe('a generated block', () => {
  it('opens with its guidance, as a field that stores nothing', () => {
    const [first, second] = generateBlock(component('Use to close a section. More.'), options)
      .fields as Shaped[]
    expect(first).toMatchObject({ name: 'blockGuidance', type: 'ui' })
    expect(first?.admin?.components?.Field).toEqual({
      path: '@forumone/throughline-design-system-payload/client#BlockGuidance',
      clientProps: { text: 'Use to close a section.' },
    })
    expect(second?.name).toBe('heading')
  })

  it('has no guidance field when the contract states no intent', () => {
    const fields = generateBlock(component(''), options).fields as Shaped[]
    expect(fields.map(field => field.name)).toEqual(['heading'])
  })
})

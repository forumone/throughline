import { ManifestSchema } from '@forumone/throughline-design-system/contract'
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { attachComponentValidator, makeContext } from '../_test-helpers.js'
import { COMPONENTS_MANIFEST_SYMBOL, compositionStep } from './composition.js'

/*
The publish gate for a composed section (forumone-2026#801): its recipe must
exist, be approved, still lint against the manifest as it is now, and have its
required fields filled — and the block itself must not be called an unknown
component.
*/

const contract = {
  name: 'ProofBand',
  category: 'section',
  description: 'A dark band with one claim, a line of support and a next step.',
  intent: 'For the point on a landing page where one claim needs room of its own, nothing else.',
  composition: { placement: ['section'], maxPerPage: null, requiredSiblings: [], forbiddenAdjacent: [] },
  content: { fields: [{ name: 'heading', type: 'text', required: true }] },
  tokens: { consumes: [] },
  accessibility: { keyboardSupport: [], screenReaderBehavior: 'A heading in a band.', contentWarnings: [] },
  examples: [{ label: 'Default', intent: 'A claim', storyId: 'x--y' }],
  antiExamples: [{ label: 'Many claims', why: 'One per band.' }],
  behavior: { fetchesData: false, hasClientState: false, animates: false, requiresAnalytics: false },
}

const tree = {
  primitive: 'Section',
  props: { variant: 'dark' },
  slots: { children: [{ primitive: 'Heading', content: { field: 'heading' } }] },
}

function manifestWith(variants: string[]) {
  return ManifestSchema.parse({
    contractVersion: '1.1.0',
    designSystem: { name: 'ds', version: '1.0.0' },
    tokens: [],
    components: {},
    primitives: {
      Section: {
        name: 'Section',
        kind: 'layout',
        description: 'A full-width band holding a column of content.',
        props: { variant: { type: 'enum', values: variants } },
        slots: { children: { description: 'What the band holds.', required: true } },
      },
      Heading: {
        name: 'Heading',
        kind: 'content',
        description: 'A heading from a text field, at level two to four.',
        content: { type: 'text' },
      },
    },
    build: { timestamp: '2026-10-04T00:00:00.000Z' },
  })
}

function setup(options: {
  recipe?: Record<string, unknown> | null
  content?: Record<string, unknown>
  variants?: string[]
  gate?: boolean
}) {
  const findByID = vi.fn(async () => (options.recipe === undefined ? { id: 5, name: 'ProofBand', status: 'approved', contract, tree } : options.recipe))
  const payload = { findByID } as unknown as Payload
  const validator = vi.fn(async () => ({ valid: true, issues: [] }))
  attachComponentValidator(payload, validator)
  Object.defineProperty(payload, COMPONENTS_MANIFEST_SYMBOL, {
    value: async () => manifestWith(options.variants ?? ['default', 'dark']),
  })
  const ctx = makeContext({
    payload,
    document: {
      layout: [
        { blockType: 'TextHero' },
        { blockType: 'ComposedSection', recipe: 5, content: options.content ?? { heading: 'Faster' } },
      ],
    },
    ...(options.gate === false
      ? {}
      : {
          options: {
            collections: [{ slug: 'pages' }],
            inngest: {} as never,
            recipes: { blockType: 'ComposedSection', collection: 'section-recipes' },
          },
        }),
  })
  return { ctx, validator, findByID }
}

describe('a composed section at publish', () => {
  it('passes with an approved recipe that still lints and filled content', async () => {
    const { ctx, validator, findByID } = setup({})
    await expect(compositionStep(ctx)).resolves.toEqual({ pass: true })
    // The block keeps its place in the order, marked, so the validator neither
    // calls it unknown nor counts it.
    expect(validator.mock.calls[0]![0]).toEqual({
      blocks: [{ type: 'TextHero' }, { type: 'ComposedSection', composed: true }],
    })
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'section-recipes', id: 5, overrideAccess: true }),
    )
  })

  it('fails while its recipe is not approved, naming it', async () => {
    const { ctx } = setup({ recipe: { id: 5, name: 'ProofBand', status: 'draft', contract, tree } })
    const result = await compositionStep(ctx)
    expect(result).toMatchObject({
      pass: false,
      issues: [
        {
          rule: 'recipe-not-approved',
          field: 'layout[1]',
          message: expect.stringMatching(/"ProofBand", which has not been approved/),
        },
      ],
    })
  })

  it('fails when the recipe no longer passes against the design system as it is now', async () => {
    // The `dark` variant was renamed since the recipe was saved and approved.
    const { ctx } = setup({ variants: ['default', 'inverse'] })
    const result = await compositionStep(ctx)
    expect(result.issues).toEqual([
      expect.objectContaining({
        rule: 'recipe-lint',
        message: expect.stringMatching(/no longer passes.*"dark" is not one of Section\.variant's values/),
      }),
    ])
  })

  it('fails when the block leaves a required field empty', async () => {
    const { ctx } = setup({ content: { heading: '' } })
    const result = await compositionStep(ctx)
    expect(result.issues).toEqual([
      expect.objectContaining({ rule: 'recipe-content', message: expect.stringMatching(/"heading" is required/) }),
    ])
  })

  it('fails when the recipe is gone', async () => {
    const { ctx } = setup({ recipe: null })
    const result = await compositionStep(ctx)
    expect(result.issues).toEqual([expect.objectContaining({ rule: 'recipe-missing' })])
  })

  it('is an unknown component, as before, on a site that has not configured recipes', async () => {
    const { ctx, validator } = setup({ gate: false })
    await compositionStep(ctx)
    expect(validator.mock.calls[0]![0]).toEqual({
      blocks: [{ type: 'TextHero' }, { type: 'ComposedSection' }],
    })
  })
})

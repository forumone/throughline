import { makeHeroContract, makeManifest } from '../contract/_fixtures.js'
import type { Manifest } from '../contract/manifest.js'
import { PrimitiveContractSchema, type PrimitiveContractInput } from '../contract/primitive.js'
import { ComponentContractSchema } from '../contract/schema.js'
import type { Recipe } from './schema.js'

/** Test fixtures: a design system with a few primitives and one inline component. */

const spacing = ['spacing-2', 'spacing-4', 'spacing-8']

const primitives: PrimitiveContractInput[] = [
  {
    name: 'Section',
    kind: 'layout',
    description: 'A full-width band holding a constrained column of content.',
    props: { variant: { type: 'enum', values: ['default', 'dark'], default: 'default' } },
    slots: { children: { description: 'What the band holds.', required: true } },
  },
  {
    name: 'Stack',
    kind: 'layout',
    description: 'Children one above another, a step of the spacing scale apart.',
    props: { gap: { type: 'token', tokenGroup: 'spacing', allowed: spacing, default: 'spacing-2' } },
    slots: { children: { description: 'What is stacked.', required: true } },
  },
  {
    name: 'TwoColumn',
    kind: 'layout',
    description: 'Two columns side by side that stack on small screens.',
    slots: {
      start: { description: 'The first column.', required: true },
      end: { description: 'The second column.', required: true, max: 1 },
    },
  },
  {
    name: 'Heading',
    kind: 'content',
    description: 'A heading from a text field, at level two to four.',
    props: { level: { type: 'enum', values: [2, 3, 4], default: 2 } },
    content: { type: 'text' },
  },
  {
    name: 'Text',
    kind: 'content',
    description: 'A paragraph of plain text from a text field.',
    content: { type: 'text' },
  },
  {
    name: 'Image',
    kind: 'content',
    description: 'An image from the media library, with its alt text.',
    content: { type: 'image' },
  },
]

export const button = ComponentContractSchema.parse({
  ...makeHeroContract(),
  name: 'Button',
  category: 'cta',
  composition: { placement: ['inline'], maxPerPage: null, requiredSiblings: [], forbiddenAdjacent: [] },
  content: {
    fields: [
      { name: 'label', type: 'text', required: true },
      { name: 'href', type: 'link', required: true },
      { name: 'style', type: 'select' },
      { name: 'external', type: 'boolean' },
    ],
    variants: [
      { name: 'primary', description: 'The main ask.', whenToUse: 'Once per section.' },
      { name: 'secondary', description: 'A lesser ask.', whenToUse: 'Beside a primary.' },
    ],
  },
})

export function recipeManifest(): Manifest {
  return makeManifest({
    contractVersion: '1.1.0',
    tokens: [
      ...spacing.map((name) => ({ name, value: '1rem', category: 'spacing' })),
      { name: 'color.brand.primary', value: '#112233', category: 'color' },
    ],
    components: { Hero: makeHeroContract(), Button: button },
    primitives: Object.fromEntries(primitives.map((p) => [p.name, PrimitiveContractSchema.parse(p)])),
  })
}

/** A stats band with a call to action: heading, text, an image, a button. */
export function goodRecipe(): Recipe {
  return {
    contract: {
      ...makeHeroContract(),
      name: 'StatsBand',
      category: 'section',
      description: 'A band with a headline, a supporting line, an image and one call to action.',
      intent:
        'For the moment on a landing page where one number or claim needs room of its own, with a single next step beside it.',
      composition: { placement: ['section'], maxPerPage: null, requiredSiblings: [], forbiddenAdjacent: [] },
      content: {
        fields: [
          { name: 'heading', type: 'text', required: true, maxLength: 80 },
          { name: 'body', type: 'text', required: true },
          { name: 'photo', type: 'image', required: true },
          { name: 'ctaLabel', type: 'text', required: true },
          { name: 'ctaHref', type: 'link', required: true },
        ],
      },
    },
    tree: {
      primitive: 'Section',
      props: { variant: 'dark' },
      slots: {
        children: [
          {
            primitive: 'TwoColumn',
            slots: {
              start: [
                {
                  primitive: 'Stack',
                  props: { gap: 'spacing-4' },
                  slots: {
                    children: [
                      { primitive: 'Heading', props: { level: 2 }, content: { field: 'heading' } },
                      { primitive: 'Text', content: { field: 'body' } },
                      {
                        component: 'Button',
                        fields: {
                          label: { field: 'ctaLabel' },
                          href: { field: 'ctaHref' },
                          style: 'primary',
                        },
                      },
                    ],
                  },
                },
              ],
              end: [{ primitive: 'Image', content: { field: 'photo' } }],
            },
          },
        ],
      },
    },
  }
}

import { describe, expect, it } from 'vitest'
import { makeManifest } from './_fixtures.js'
import { lintManifest } from './lint.js'
import { ManifestSchema } from './manifest.js'
import { PrimitiveContractSchema, type PrimitiveContractInput } from './primitive.js'
import { CONTRACT_VERSION, SUPPORTED_CONTRACT_VERSIONS } from './schema.js'

const stack: PrimitiveContractInput = {
  name: 'Stack',
  kind: 'layout',
  description: 'Children one above another, with a gap from the spacing scale between them.',
  props: {
    gap: { type: 'token', tokenGroup: 'spacing', allowed: ['spacing-2', 'spacing-4'], default: 'spacing-2' },
  },
  slots: { children: { description: 'What is stacked.' } },
}

const heading: PrimitiveContractInput = {
  name: 'Heading',
  kind: 'content',
  description: 'A section heading from a text field, at level two to four.',
  props: { level: { type: 'enum', values: [2, 3, 4], default: 2 } },
  content: { type: 'text' },
}

const tokens = [
  { name: 'spacing-2', value: '1rem', category: 'spacing' },
  { name: 'spacing-4', value: '2rem', category: 'spacing' },
  { name: 'ui-accent', value: '#123456', category: 'color' },
]

describe('PrimitiveContractSchema', () => {
  it('accepts a layout primitive with slots, and a content primitive with content', () => {
    expect(PrimitiveContractSchema.safeParse(stack).success).toBe(true)
    expect(PrimitiveContractSchema.parse(heading).content).toEqual({ type: 'text', required: true })
  })

  it.each([
    ['a content primitive with no content', { ...heading, content: undefined }, /says what kind of content/],
    ['a content primitive with slots', { ...heading, slots: { children: { description: 'x' } } }, /nothing nests/],
    ['a layout primitive with content', { ...stack, content: { type: 'text' } }, /its content is what its slots hold/],
    ['a layout primitive with no slots', { ...stack, slots: {} }, /nowhere to put anything/],
    [
      'a default that is not one of the values',
      { ...heading, props: { level: { type: 'enum', values: [2, 3], default: 5 } } },
      /not one of .*level.*'s values/,
    ],
    [
      'a token default that is not allowed',
      { ...stack, props: { gap: { type: 'token', tokenGroup: 'spacing', allowed: ['spacing-2'], default: 'spacing-9' } } },
      /not one of the tokens .*gap.* allows/,
    ],
    ['a free-form string prop', { ...stack, props: { className: { type: 'string' } } }, /Invalid discriminator/],
    ['a lowercase name', { ...stack, name: 'stack' }, /PascalCase/],
  ])('refuses %s', (_, primitive, message) => {
    const result = PrimitiveContractSchema.safeParse(primitive)
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toMatch(message)
  })
})

describe('the manifest with primitives', () => {
  it('is contract 1.1.0, and still reads a 1.0.0 manifest, as having none', () => {
    expect(CONTRACT_VERSION).toBe('1.1.0')
    expect(SUPPORTED_CONTRACT_VERSIONS).toContain('1.0.0')
    const { primitives: _none, ...old } = makeManifest({ contractVersion: '1.0.0' })
    const parsed = ManifestSchema.parse(old)
    expect(parsed.primitives).toEqual({})
  })

  it('keeps the primitives it is given, rather than stripping them', () => {
    const parsed = ManifestSchema.parse(
      makeManifest({ contractVersion: '1.1.0', primitives: { Stack: PrimitiveContractSchema.parse(stack) } }),
    )
    expect(Object.keys(parsed.primitives)).toEqual(['Stack'])
  })
})

describe('lintManifest on primitives', () => {
  const lint = (primitives: PrimitiveContractInput[], extra = {}) =>
    lintManifest(
      makeManifest({
        tokens,
        primitives: Object.fromEntries(primitives.map((p) => [p.name, PrimitiveContractSchema.parse(p)])),
        ...extra,
      }),
    ).filter((issue) => issue.rule.startsWith('primitives'))

  it('passes primitives whose tokens exist in the right group', () => {
    expect(lint([stack, heading])).toEqual([])
  })

  it('refuses a token the table does not have', () => {
    const bad = { ...stack, props: { gap: { type: 'token' as const, tokenGroup: 'spacing', allowed: ['spacing-2', 'spacing-99'] } } }
    expect(lint([bad])).toEqual([
      expect.objectContaining({ severity: 'error', rule: 'primitives.props.tokens', message: expect.stringMatching(/spacing-99/) }),
    ])
  })

  it('refuses a token from another group than the prop draws from', () => {
    const bad = { ...stack, props: { gap: { type: 'token' as const, tokenGroup: 'spacing', allowed: ['ui-accent'] } } }
    expect(lint([bad])).toEqual([
      expect.objectContaining({ rule: 'primitives.props.tokenGroup', message: expect.stringMatching(/a color token/) }),
    ])
  })

  it('refuses a primitive that shares a name with a component', () => {
    const named = { ...stack, name: 'Hero' }
    const issues = lint([named])
    expect(issues).toContainEqual(expect.objectContaining({ rule: 'primitives.name' }))
  })
})

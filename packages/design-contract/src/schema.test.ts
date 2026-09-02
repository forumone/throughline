import { describe, it, expect } from 'vitest'
import { CONTRACT_VERSION, ComponentContractSchema, groupOf } from './schema.js'
import { makeHeroContract } from './_fixtures.js'

describe('CONTRACT_VERSION', () => {
  it('is a semver string', () => {
    expect(CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('ComponentContractSchema', () => {
  it('validates a complete contract', () => {
    const result = ComponentContractSchema.safeParse(makeHeroContract())
    expect(result.success).toBe(true)
  })

  it('rejects non-PascalCase names', () => {
    const result = ComponentContractSchema.safeParse(makeHeroContract({ name: 'hero' }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'name')).toBe(true)
    }
  })

  it('rejects unknown categories', () => {
    const input = { ...makeHeroContract(), category: 'banner' as never }
    const result = ComponentContractSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts a contract with no group', () => {
    const result = ComponentContractSchema.safeParse(makeHeroContract())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.group).toBeUndefined()
    }
  })

  it('accepts a known group', () => {
    const result = ComponentContractSchema.safeParse(makeHeroContract({ group: 'proof' }))
    expect(result.success).toBe(true)
  })

  it('rejects an unknown group', () => {
    const input = { ...makeHeroContract(), group: 'section' as never }
    const result = ComponentContractSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'group')).toBe(true)
    }
  })

  it('requires at least one example', () => {
    const result = ComponentContractSchema.safeParse(makeHeroContract({ examples: [] }))
    expect(result.success).toBe(false)
  })

  it('requires a reasonable screenReaderBehavior length', () => {
    const result = ComponentContractSchema.safeParse(
      makeHeroContract({
        accessibility: {
          keyboardSupport: [],
          screenReaderBehavior: 'short',
          contentWarnings: [],
        },
      }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects descriptions that are too short', () => {
    const result = ComponentContractSchema.safeParse(makeHeroContract({ description: 'too short' }))
    expect(result.success).toBe(false)
  })

  it('rejects descriptions that are too long', () => {
    const result = ComponentContractSchema.safeParse(
      makeHeroContract({ description: 'a'.repeat(281) }),
    )
    expect(result.success).toBe(false)
  })

  it('applies defaults for composition.maxPerPage and antiExamples', () => {
    const minimal = {
      name: 'Card',
      category: 'card',
      description: 'A simple content card with a title and optional image on the right.',
      intent:
        'Used inside a Section to surface a piece of content with a consistent, scannable shape.',
      composition: { placement: ['section'] },
      content: { fields: [{ name: 'title', type: 'text' }] },
      tokens: { consumes: [] },
      accessibility: { screenReaderBehavior: 'Title is announced as a heading.' },
      examples: [{ label: 'Default', intent: 'x', storyId: 'card--default' }],
    }
    const result = ComponentContractSchema.safeParse(minimal)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.composition.maxPerPage).toBeNull()
      expect(result.data.antiExamples).toEqual([])
      expect(result.data.content.fields[0]?.required).toBe(false)
    }
  })

  it('carries a boolean field’s defaultValue through', () => {
    const contract = makeHeroContract({
      content: {
        fields: [{ name: 'hasFacade', type: 'boolean', required: false, defaultValue: true }],
      },
    })
    const result = ComponentContractSchema.safeParse(contract)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content.fields[0]?.defaultValue).toBe(true)
    }
  })

  it('leaves defaultValue undefined when a boolean field omits it', () => {
    const contract = makeHeroContract({
      content: { fields: [{ name: 'isCompact', type: 'boolean', required: false }] },
    })
    const result = ComponentContractSchema.safeParse(contract)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content.fields[0]?.defaultValue).toBeUndefined()
    }
  })

  // Only `boolean` reads it, so anywhere else it is a value that would silently
  // never take effect.
  it('rejects defaultValue on a non-boolean field', () => {
    const contract = makeHeroContract({
      content: {
        fields: [
          { name: 'headline', type: 'text', required: true, defaultValue: true } as never,
        ],
      },
    })
    const result = ComponentContractSchema.safeParse(contract)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.').endsWith('defaultValue')),
      ).toBe(true)
    }
  })

  it('accepts recursive content fields via `of`', () => {
    const contract = makeHeroContract({
      content: {
        fields: [
          {
            name: 'items',
            type: 'array',
            required: true,
            of: [{ name: 'label', type: 'text', required: true }],
          },
        ],
      },
    })
    const result = ComponentContractSchema.safeParse(contract)
    expect(result.success).toBe(true)
  })
})

describe('groupOf', () => {
  it('returns the group when one is set', () => {
    expect(groupOf({ category: 'section', group: 'narrative' })).toBe('narrative')
  })

  it('falls back to the category when no group is set', () => {
    expect(groupOf({ category: 'section' })).toBe('section')
  })

  it('falls back when the group is explicitly undefined', () => {
    expect(groupOf({ category: 'hero', group: undefined })).toBe('hero')
  })
})

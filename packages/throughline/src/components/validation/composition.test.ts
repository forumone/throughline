import { describe, expect, it } from 'vitest'
import { loadManifest } from '@forumone/throughline-design-system/contract'
import referenceManifest from '@forumone/throughline-reference-ds/manifest' with { type: 'json' }
import { findAntiPatterns, validateComposition } from './composition.js'

const manifest = loadManifest(referenceManifest)

describe('validateComposition (against reference DS)', () => {
  it('reports valid for a sane composition', () => {
    const result = validateComposition(
      { blocks: [{ type: 'Hero' }, { type: 'CardGrid' }, { type: 'CTASection' }] },
      manifest,
    )
    expect(result.valid).toBe(true)
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('flags multiple Heroes (maxPerPage = 1)', () => {
    const result = validateComposition({ blocks: [{ type: 'Hero' }, { type: 'Hero' }] }, manifest)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.rule === 'max-per-page')).toBe(true)
  })

  it('flags forbiddenAdjacent (Hero followed by SectionIntro)', () => {
    const result = validateComposition(
      { blocks: [{ type: 'Hero' }, { type: 'SectionIntro' }] },
      manifest,
    )
    const adjErrors = result.issues.filter((i) => i.rule === 'forbidden-adjacent')
    expect(adjErrors.length).toBeGreaterThan(0)
  })

  it('flags unknown components', () => {
    const result = validateComposition({ blocks: [{ type: 'Ghost' }] }, manifest)
    expect(result.valid).toBe(false)
    expect(result.issues[0]?.rule).toBe('unknown-component')
  })

  // forumone-2026#801: the placement rule, and composed sections.
  it('flags a component placed only inline when it stands on a page by itself', () => {
    // The reference DS places Card in a section or inline; narrowed here to inline only.
    const raw = structuredClone(referenceManifest) as {
      components: Record<string, { composition: { placement: string[] } }>
    }
    raw.components['Card']!.composition.placement = ['inline']
    const result = validateComposition(
      { blocks: [{ type: 'Hero' }, { type: 'Card' }] },
      loadManifest(raw),
    )
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', rule: 'placement', blockIndex: 1 }),
    )
  })

  it('does not flag a component that may also sit in a section', () => {
    const result = validateComposition({ blocks: [{ type: 'Card' }] }, manifest)
    expect(result.issues.filter((i) => i.rule === 'placement')).toEqual([])
  })

  it('skips a composed section rather than calling it unknown, keeping the indexes', () => {
    const result = validateComposition(
      { blocks: [{ type: 'ComposedSection', composed: true }, { type: 'Nope' }] },
      manifest,
    )
    expect(result.issues).toEqual([
      expect.objectContaining({ rule: 'unknown-component', blockIndex: 1 }),
    ])
  })

  it('flags unknown variants', () => {
    const result = validateComposition(
      { blocks: [{ type: 'Hero', variant: 'mega' }] },
      manifest,
    )
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.rule === 'unknown-variant')).toBe(true)
  })

  it('warns when a requiredSiblings entry is missing', () => {
    const result = validateComposition({ blocks: [{ type: 'CardGrid' }] }, manifest)
    expect(result.valid).toBe(true)
    expect(result.issues.some((i) => i.severity === 'warning' && i.rule === 'required-sibling-missing')).toBe(true)
  })

  it('accepts known variants', () => {
    const result = validateComposition(
      { blocks: [{ type: 'Hero', variant: 'compact' }] },
      manifest,
    )
    expect(result.valid).toBe(true)
  })

  // forumone-2026#805: what an editor reads, in the names they picked the blocks by.
  describe('messages', () => {
    const messages = (input: Parameters<typeof validateComposition>[0]) =>
      validateComposition(input, manifest).issues.map((issue) => issue.message)

    it('names components the way the block picker does by default', () => {
      expect(messages({ blocks: [{ type: 'Hero' }, { type: 'SectionIntro' }] })).toContain(
        "Hero can't come directly before Section Intro. Move one of them, or put another block between them.",
      )
      expect(messages({ blocks: [{ type: 'Hero' }, { type: 'Hero' }] })).toContain(
        'A page can have only 1 Hero block, and this one has 2. Remove 1.',
      )
      expect(messages({ blocks: [{ type: 'CardGrid' }] })[0]).toMatch(/^Card Grid works best with a /)
    })

    it('uses the labels it is given, which is how a block renamed in the CMS is named', () => {
      const label = (type: string) => (type === 'SectionIntro' ? 'Intro' : `The ${type}`)
      expect(
        messages({ blocks: [{ type: 'Hero' }, { type: 'SectionIntro' }], label }),
      ).toContain(
        "The Hero can't come directly before Intro. Move one of them, or put another block between them.",
      )
    })

    it('says what to do with a block of a type the site no longer has', () => {
      expect(messages({ blocks: [{ type: 'Ghost' }] })).toEqual([
        'This block is a type this site no longer has ("Ghost"). Remove it, or tell a site administrator.',
      ])
    })

    it('calls a variant a style', () => {
      expect(messages({ blocks: [{ type: 'Hero', variant: 'mega' }] })).toContain(
        'The "mega" style isn\'t available for Hero any more. Choose another style in the block.',
      )
    })
  })
})

describe('findAntiPatterns (against reference DS)', () => {
  it('flags multiple Heroes via the antiExample label', () => {
    const matches = findAntiPatterns(
      { blocks: [{ type: 'Hero' }, { type: 'CardGrid' }, { type: 'Hero' }] },
      manifest,
    )
    expect(matches.some((m) => m.pattern.toLowerCase().includes('multiple heroes'))).toBe(true)
  })

  it('flags Hero at the bottom of a page', () => {
    const matches = findAntiPatterns(
      { blocks: [{ type: 'CardGrid' }, { type: 'Hero' }] },
      manifest,
    )
    expect(matches.some((m) => m.pattern.toLowerCase().includes('bottom'))).toBe(true)
  })

  it('returns no matches for a clean composition', () => {
    const matches = findAntiPatterns(
      { blocks: [{ type: 'Hero' }, { type: 'CardGrid' }, { type: 'CTASection' }] },
      manifest,
    )
    expect(matches).toEqual([])
  })

  it('does not double-report when a single block matches multiple branches', () => {
    const matches = findAntiPatterns(
      { blocks: [{ type: 'Hero' }, { type: 'Hero' }] },
      manifest,
    )
    const counts = new Map<string, number>()
    for (const m of matches) {
      const key = `${m.blockIndex}:${m.pattern}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const value of counts.values()) {
      expect(value).toBe(1)
    }
  })
})

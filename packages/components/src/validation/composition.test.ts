import { describe, expect, it } from 'vitest'
import { loadManifest } from '@forumone/throughline-design-contract'
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

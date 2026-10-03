import { describe, it, expect } from 'vitest'
import { assertManifestClean, formatLintIssues, lintManifest } from './lint.js'
import { makeHeroContract, makeManifest } from './_fixtures.js'

describe('lintManifest', () => {
  it('returns an empty array for a clean manifest', () => {
    const manifest = makeManifest({
      components: {
        Hero: makeHeroContract({
          composition: { placement: ['page'], requiredSiblings: [], forbiddenAdjacent: [] },
        }),
      },
    })
    expect(lintManifest(manifest)).toEqual([])
  })

  it('errors on unknown requiredSiblings', () => {
    const manifest = makeManifest({
      components: {
        Hero: makeHeroContract({
          composition: {
            placement: ['page'],
            requiredSiblings: ['Footer'],
            forbiddenAdjacent: [],
          },
        }),
      },
    })
    const issues = lintManifest(manifest)
    const errors = issues.filter((i) => i.severity === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]?.rule).toBe('composition.requiredSiblings')
  })

  it('errors on unknown forbiddenAdjacent', () => {
    const manifest = makeManifest({
      components: {
        Hero: makeHeroContract({
          composition: {
            placement: ['page'],
            requiredSiblings: [],
            forbiddenAdjacent: ['Ghost'],
          },
        }),
      },
    })
    const issues = lintManifest(manifest)
    expect(issues.some((i) => i.rule === 'composition.forbiddenAdjacent')).toBe(true)
  })

  it('errors on unknown tokens (manifest-declared)', () => {
    const manifest = makeManifest({
      tokens: [{ name: 'color.other', value: '#fff', category: 'color' }],
      components: {
        Hero: makeHeroContract({
          tokens: { consumes: ['color.missing'] },
          composition: { placement: ['page'], requiredSiblings: [], forbiddenAdjacent: [] },
        }),
      },
    })
    const issues = lintManifest(manifest)
    expect(issues.some((i) => i.rule === 'tokens.consumes')).toBe(true)
  })

  it('errors on unknown tokens against external token set', () => {
    const manifest = makeManifest({
      components: {
        Hero: makeHeroContract({
          composition: { placement: ['page'], requiredSiblings: [], forbiddenAdjacent: [] },
        }),
      },
    })
    const issues = lintManifest(manifest, { availableTokens: new Set(['color.other']) })
    expect(issues.some((i) => i.rule === 'tokens.consumes')).toBe(true)
  })

  it('errors on unknown story IDs when a set is provided', () => {
    const manifest = makeManifest({
      components: {
        Hero: makeHeroContract({
          composition: { placement: ['page'], requiredSiblings: [], forbiddenAdjacent: [] },
        }),
      },
    })
    const issues = lintManifest(manifest, { availableStoryIds: new Set(['hero--other']) })
    expect(issues.some((i) => i.rule === 'examples.storyId')).toBe(true)
  })

  it('skips story ID check when no set is provided', () => {
    const manifest = makeManifest({
      components: {
        Hero: makeHeroContract({
          composition: { placement: ['page'], requiredSiblings: [], forbiddenAdjacent: [] },
        }),
      },
    })
    expect(
      lintManifest(manifest).some((i) => i.rule === 'examples.storyId'),
    ).toBe(false)
  })

  it('warns when antiExamples is empty', () => {
    const manifest = makeManifest({
      components: {
        Hero: makeHeroContract({
          antiExamples: [],
          composition: { placement: ['page'], requiredSiblings: [], forbiddenAdjacent: [] },
        }),
      },
    })
    expect(
      lintManifest(manifest).some(
        (i) => i.severity === 'warning' && i.rule === 'antiExamples.empty',
      ),
    ).toBe(true)
  })

  it('warns on brief intent statements', () => {
    const manifest = makeManifest({
      components: {
        Hero: makeHeroContract({
          intent: 'Too short intent statement.',
          composition: { placement: ['page'], requiredSiblings: [], forbiddenAdjacent: [] },
        }),
      },
    })
    expect(
      lintManifest(manifest).some(
        (i) => i.severity === 'warning' && i.rule === 'intent.brevity',
      ),
    ).toBe(true)
  })
})

describe('formatLintIssues', () => {
  it('returns a clean message for empty input', () => {
    expect(formatLintIssues([])).toBe('No issues found.')
  })

  it('groups errors and warnings separately', () => {
    const message = formatLintIssues([
      { severity: 'error', component: 'Hero', rule: 'r1', message: 'err' },
      { severity: 'warning', component: 'Card', rule: 'r2', message: 'warn' },
    ])
    expect(message).toContain('Errors (1):')
    expect(message).toContain('Warnings (1):')
    expect(message).toContain('[Hero] r1: err')
    expect(message).toContain('[Card] r2: warn')
  })
})

describe('assertManifestClean', () => {
  it('throws when errors are present', () => {
    const manifest = makeManifest({
      components: {
        Hero: makeHeroContract({
          composition: {
            placement: ['page'],
            requiredSiblings: ['Missing'],
            forbiddenAdjacent: [],
          },
        }),
      },
    })
    expect(() => assertManifestClean(manifest)).toThrow(/Manifest has errors/)
  })

  it('passes when only warnings are present', () => {
    const manifest = makeManifest({
      components: {
        Hero: makeHeroContract({
          antiExamples: [],
          composition: { placement: ['page'], requiredSiblings: [], forbiddenAdjacent: [] },
        }),
      },
    })
    expect(() => assertManifestClean(manifest)).not.toThrow()
  })
})

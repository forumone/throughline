import { describe, expect, it } from 'vitest'
import { loadManifest } from '@forumone/throughline-design-contract'
import referenceManifest from '@forumone/throughline-reference-ds/manifest' with { type: 'json' }
import { createTfidfMatcher } from './tfidf.js'

const loaded = loadManifest(referenceManifest)
const components = Object.values(loaded.raw.components)

function topMatch(query: string): string | undefined {
  const matcher = createTfidfMatcher(components)
  return matcher.rank(query)[0]?.component.name
}

describe('createTfidfMatcher (against reference DS)', () => {
  it('ranks Hero highly for landing-page-opener intents', () => {
    expect(topMatch('introduce a new program on a landing page')).toBe('Hero')
  })

  it('ranks FAQ highly for question-and-answer intents', () => {
    expect(topMatch('show frequently asked questions about applying')).toBe('FAQ')
  })

  it('ranks Stats highly for headline metrics intents', () => {
    expect(topMatch('display impact numbers like grants funded')).toBe('Stats')
  })

  it('ranks CardGrid highly for layout-of-cards intents', () => {
    const top3 = createTfidfMatcher(components)
      .rank('lay out a grid of program cards')
      .slice(0, 3)
      .map((r) => r.component.name)
    expect(top3).toContain('CardGrid')
  })

  it('ranks Quote highly for testimonial intents', () => {
    expect(topMatch('feature a testimonial pullquote with attribution')).toBe('Quote')
  })

  it('returns every indexed component in the rank output', () => {
    const ranked = createTfidfMatcher(components).rank('anything')
    expect(ranked).toHaveLength(components.length)
  })

  it('returns components in score-descending order', () => {
    const ranked = createTfidfMatcher(components).rank('introduce a new program')
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]?.score).toBeGreaterThanOrEqual(ranked[i]?.score ?? -Infinity)
    }
  })
})

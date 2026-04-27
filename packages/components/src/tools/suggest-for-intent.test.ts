import { describe, expect, it, vi } from 'vitest'
import { createTfidfMatcher } from '../matching/tfidf.js'
import { createSuggestForIntentTool } from './suggest-for-intent.js'
import { callTool, fixtureLoader, loadFixture } from './_test-helpers.js'

function makeDeps(overrides: { maxRecommendations?: number } = {}) {
  const loaded = loadFixture()
  const components = Object.values(loaded.raw.components)
  const auditWriter = vi.fn(async () => {})
  const tool = createSuggestForIntentTool({
    loader: fixtureLoader(loaded),
    matcher: createTfidfMatcher(components),
    auditWriter,
    maxRecommendations: overrides.maxRecommendations ?? 5,
  })
  return { tool, auditWriter }
}

describe('suggest_for_intent', () => {
  it('returns up to maxRecommendations and emits an audit event', async () => {
    const { tool, auditWriter } = makeDeps({ maxRecommendations: 3 })
    const result = (await callTool(tool, {
      intent: 'introduce a new program on a landing page',
    })) as { recommendations: Array<{ component: string }> }

    expect(result.recommendations).toHaveLength(3)
    expect(result.recommendations[0]?.component).toBe('Hero')
    expect(auditWriter).toHaveBeenCalledTimes(1)
    expect(auditWriter.mock.calls[0]?.[0].action).toBe('design.suggest')
  })

  it('attaches warnings when the recommendation conflicts with existing blocks', async () => {
    const { tool } = makeDeps({ maxRecommendations: 5 })
    const result = (await callTool(tool, {
      intent: 'introduce a new program',
      context: { existingBlocks: ['Hero'] },
    })) as { recommendations: Array<{ component: string; warnings?: string[] }> }

    const heroRec = result.recommendations.find((r) => r.component === 'Hero')
    expect(heroRec?.warnings?.length ?? 0).toBeGreaterThan(0)
  })

  it('passes the _meta prompt through to audit', async () => {
    const { tool, auditWriter } = makeDeps()
    await callTool(tool, {
      intent: 'show stats',
      _meta: { userPrompt: 'add an impact section', reasoning: 'mid-page break' },
    })
    const call = auditWriter.mock.calls[0]?.[0]
    expect(call?.prompt).toBe('add an impact section')
    expect(call?.reasoning).toBe('mid-page break')
  })
})

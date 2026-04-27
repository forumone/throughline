import { describe, expect, it, vi } from 'vitest'
import { createFindAntiPatternTool } from './find-anti-pattern.js'
import { callTool, fixtureLoader } from './_test-helpers.js'

function makeDeps() {
  const auditWriter = vi.fn(async () => {})
  const tool = createFindAntiPatternTool({ loader: fixtureLoader(), auditWriter })
  return { tool, auditWriter }
}

describe('find_anti_pattern', () => {
  it('surfaces multiple-Hero anti-pattern', async () => {
    const { tool } = makeDeps()
    const result = (await callTool(tool, {
      blocks: [{ type: 'Hero' }, { type: 'CardGrid' }, { type: 'Hero' }],
    })) as { matches: Array<{ pattern: string }> }
    expect(result.matches.some((m) => m.pattern.toLowerCase().includes('multiple'))).toBe(true)
  })

  it('returns empty matches for a clean composition', async () => {
    const { tool } = makeDeps()
    const result = (await callTool(tool, {
      blocks: [{ type: 'Hero' }, { type: 'CardGrid' }, { type: 'CTASection' }],
    })) as { matches: unknown[] }
    expect(result.matches).toEqual([])
  })

  it('emits a design.find_anti_pattern audit event', async () => {
    const { tool, auditWriter } = makeDeps()
    await callTool(tool, { blocks: [{ type: 'Hero' }] })
    expect(auditWriter.mock.calls[0]?.[0].action).toBe('design.find_anti_pattern')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createValidateCompositionTool } from './validate-composition.js'
import { callTool, fixtureLoader } from './_test-helpers.js'

function makeDeps() {
  const auditWriter = vi.fn(async () => {})
  const tool = createValidateCompositionTool({ loader: fixtureLoader(), auditWriter })
  return { tool, auditWriter }
}

describe('validate_composition', () => {
  it('returns valid for a clean layout', async () => {
    const { tool } = makeDeps()
    const result = (await callTool(tool, { blocks: [{ type: 'Hero' }, { type: 'CTASection' }] })) as {
      valid: boolean
    }
    expect(result.valid).toBe(true)
  })

  it('returns invalid with errors for a layout that breaks composition rules', async () => {
    const { tool } = makeDeps()
    const result = (await callTool(tool, { blocks: [{ type: 'Hero' }, { type: 'Hero' }] })) as {
      valid: boolean
      issues: Array<{ severity: string; rule: string }>
    }
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.rule === 'max-per-page')).toBe(true)
  })

  it('emits a design.validate audit event', async () => {
    const { tool, auditWriter } = makeDeps()
    await callTool(tool, { blocks: [{ type: 'Hero' }] })
    expect(auditWriter).toHaveBeenCalledTimes(1)
    expect(auditWriter.mock.calls[0]?.[0].action).toBe('design.validate')
  })
})

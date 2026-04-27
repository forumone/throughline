import { describe, expect, it, vi } from 'vitest'
import { compositionStep } from './composition.js'
import { attachComponentValidator, makeContext } from '../_test-helpers.js'

describe('compositionStep', () => {
  it('passes when layout is empty', async () => {
    const ctx = makeContext({ document: { layout: [] } })
    const result = await compositionStep(ctx)
    expect(result.pass).toBe(true)
  })

  it('passes when layout is missing', async () => {
    const ctx = makeContext({ document: {} })
    const result = await compositionStep(ctx)
    expect(result.pass).toBe(true)
  })

  it('fails when components plugin is not registered', async () => {
    const ctx = makeContext({
      document: { layout: [{ blockType: 'hero' }] },
    })
    const result = await compositionStep(ctx)
    expect(result.pass).toBe(false)
    expect(result.code).toBe('components-server-missing')
  })

  it('passes when validator returns valid: true', async () => {
    const ctx = makeContext({
      document: { layout: [{ blockType: 'hero' }, { blockType: 'cardGrid' }] },
    })
    const validator = vi.fn(async () => ({ valid: true, issues: [] }))
    attachComponentValidator(ctx.payload, validator)

    const result = await compositionStep(ctx)
    expect(result.pass).toBe(true)
    expect(validator).toHaveBeenCalledOnce()
    const args = validator.mock.calls[0]?.[0] as { blocks: Array<{ type: string }> }
    expect(args.blocks.map((b) => b.type)).toEqual(['hero', 'cardGrid'])
  })

  it('fails with composition errors when validator reports them', async () => {
    const ctx = makeContext({
      document: { layout: [{ blockType: 'hero' }, { blockType: 'hero' }] },
    })
    attachComponentValidator(ctx.payload, async () => ({
      valid: false,
      issues: [
        { severity: 'error', rule: 'max-per-page', message: 'Too many heroes', blockIndex: 1 },
        { severity: 'warning', rule: 'required-sibling-missing', message: 'CardGrid expects Card' },
      ],
    }))

    const result = await compositionStep(ctx)
    expect(result.pass).toBe(false)
    expect(result.code).toBe('composition-errors')
    expect(result.issues).toHaveLength(1)
    expect(result.issues?.[0]?.field).toBe('layout[1]')
  })
})

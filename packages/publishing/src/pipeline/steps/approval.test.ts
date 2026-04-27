import { describe, expect, it, vi } from 'vitest'
import { approvalStep } from './approval.js'
import { makeContext } from '../_test-helpers.js'
import type { ApprovalResolver } from '../../options.js'

describe('approvalStep', () => {
  it('passes when policy does not require approval', async () => {
    const result = await approvalStep(
      makeContext({ document: { policy: {} } }),
    )
    expect(result.pass).toBe(true)
  })

  it('fails when approval is required but no resolver is configured', async () => {
    const result = await approvalStep(
      makeContext({
        document: { policy: { requiresApproval: true } },
      }),
    )
    expect(result.pass).toBe(false)
    expect(result.code).toBe('approval-resolver-missing')
  })

  it('fails when resolver returns null', async () => {
    const resolver: ApprovalResolver = { getActiveApproval: vi.fn(async () => null) }
    const ctx = makeContext({
      document: { policy: { requiresApproval: true } },
    })
    ctx.options.approvalResolver = resolver
    const result = await approvalStep(ctx)
    expect(result.pass).toBe(false)
    expect(result.code).toBe('approval-required')
  })

  it('passes when resolver returns an active approval', async () => {
    const resolver: ApprovalResolver = {
      getActiveApproval: vi.fn(async () => ({
        id: 'a1',
        grantedAt: '2026-04-22T12:00:00.000Z',
        grantedBy: 'u2',
        version: 'v1',
      })),
    }
    const ctx = makeContext({
      document: { policy: { requiresApproval: true }, updatedAt: '2026-04-22T13:00:00.000Z' },
    })
    ctx.options.approvalResolver = resolver
    const result = await approvalStep(ctx)
    expect(result.pass).toBe(true)
    expect(resolver.getActiveApproval).toHaveBeenCalledWith('pages', 'p1', '2026-04-22T13:00:00.000Z')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { documentContentHash } from '@forumone/throughline-core'
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
    const document = { policy: { requiresApproval: true }, title: 'About us' }
    const ctx = makeContext({ document })
    ctx.options.approvalResolver = resolver
    const result = await approvalStep(ctx)
    expect(result.pass).toBe(true)
    expect(resolver.getActiveApproval).toHaveBeenCalledWith(
      'pages',
      'p1',
      await documentContentHash(document),
    )
  })

  /*
  The binding this step exists to get right. `updatedAt` moves on every save,
  including every tick of autosave, so binding to it invalidated a pending
  approval continuously. The version handed to the resolver must depend on
  what the approver read and on nothing else. See #341.
  */
  it('asks for the same version after a save that changed nothing', async () => {
    const asked: string[] = []
    const resolver: ApprovalResolver = {
      getActiveApproval: vi.fn(async (_c, _i, version) => {
        asked.push(version)
        return null
      }),
    }
    for (const updatedAt of ['12:34:56', '12:34:58', '12:35:00']) {
      const ctx = makeContext({
        document: {
          policy: { requiresApproval: true },
          title: 'About us',
          updatedAt: `2026-04-22T${updatedAt}.000Z`,
        },
      })
      ctx.options.approvalResolver = resolver
      await approvalStep(ctx)
    }
    expect(new Set(asked).size).toBe(1)
  })

  it('asks for a different version after a save that changed something', async () => {
    const asked: string[] = []
    const resolver: ApprovalResolver = {
      getActiveApproval: vi.fn(async (_c, _i, version) => {
        asked.push(version)
        return null
      }),
    }
    for (const title of ['About us', 'About Us']) {
      const ctx = makeContext({
        document: { policy: { requiresApproval: true }, title },
      })
      ctx.options.approvalResolver = resolver
      await approvalStep(ctx)
    }
    expect(asked[0]).not.toBe(asked[1])
  })
})

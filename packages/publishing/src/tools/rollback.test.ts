import { describe, expect, it, vi } from 'vitest'
import { createRollbackTool } from './rollback.js'
import { callTool, fakeContext, makeDeps } from './_test-helpers.js'

describe('rollback tool', () => {
  it('restores the named version, fires content/page.rolled_back, audits success', async () => {
    const deps = makeDeps({
      payloadFindVersions: vi.fn(async () => ({
        docs: [{ id: 'v_old', parent: 'p1' }],
        totalDocs: 1,
      })),
    })

    const result = (await callTool(createRollbackTool(deps), {
      collection: 'pages',
      id: 'p1',
      versionId: 'v_old',
    })) as { restored: boolean; toVersionId?: string }

    expect(result.restored).toBe(true)
    expect(result.toVersionId).toBe('v_old')

    /*
    `user` and `overrideAccess: false` are the assertion, not noise. This call
    used to be `{ collection, id }` — no user, no override flag — so a rollback
    wrote to a published document with nothing consulted, and this test said so
    was fine. Audit 04 F-02.
    */
    expect(deps.spies.payloadRestoreVersion).toHaveBeenCalledWith({
      collection: 'pages',
      id: 'v_old',
      user: fakeContext.user,
      overrideAccess: false,
    })

    const eventArgs = deps.spies.inngestSend.mock.calls[0]?.[0] as { name: string; data: Record<string, unknown> }
    expect(eventArgs.name).toBe('content/page.rolled_back')
    expect(eventArgs.data.toVersionId).toBe('v_old')

    const auditArgs = deps.auditMock.mock.calls[0]?.[0] as { action: string; success: boolean }
    expect(auditArgs.action).toBe('publishing.rollback')
    expect(auditArgs.success).toBe(true)
  })

  it('refuses to restore a version that does not belong to the document', async () => {
    const deps = makeDeps({
      payloadFindVersions: vi.fn(async () => ({ docs: [], totalDocs: 0 })),
    })

    const result = (await callTool(createRollbackTool(deps), {
      collection: 'pages',
      id: 'p1',
      versionId: 'v_bogus',
    })) as { restored: boolean; reason?: string }

    expect(result.restored).toBe(false)
    expect(result.reason).toMatch(/not found/)
    expect(deps.spies.payloadRestoreVersion).not.toHaveBeenCalled()
    expect(deps.spies.inngestSend).not.toHaveBeenCalled()
    const auditArgs = deps.auditMock.mock.calls[0]?.[0] as { success: boolean }
    expect(auditArgs.success).toBe(false)
  })
})

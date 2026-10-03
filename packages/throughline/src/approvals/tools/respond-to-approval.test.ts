import { describe, expect, it, vi } from 'vitest'
import { createRespondToApprovalTool } from './respond-to-approval.js'
import { callTool, makeContext, makeDeps } from './_test-helpers.js'

const pendingApproval = {
  id: 'apr_1',
  status: 'pending',
  targetCollection: 'pages',
  targetId: 'p1',
  targetTitle: 'Climate program',
  approverGroups: ['editorial'],
  requestedBy: 'usr_3',
}

describe('respond_to_approval', () => {
  it('records an approve decision and fires approval/decided', async () => {
    const deps = makeDeps({
      payloadFindByID: vi.fn(async () => pendingApproval),
    })

    const result = (await callTool(createRespondToApprovalTool(deps), {
      approvalId: 'apr_1',
      decision: 'approve',
      notes: 'Looks good — copy reads well.',
    })) as { success: boolean; status: string }

    expect(result.success).toBe(true)
    expect(result.status).toBe('granted')

    const updateArgs = deps.spies.payloadUpdate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>
    }
    expect(updateArgs.data['status']).toBe('granted')
    expect(updateArgs.data['decidedBy']).toBe('usr_1')

    const eventArgs = deps.spies.inngestSend.mock.calls[0]?.[0] as { name: string; data: Record<string, unknown> }
    expect(eventArgs.name).toBe('approval/decided')
    expect(eventArgs.data.decision).toBe('granted')

    const auditArgs = deps.auditMock.mock.calls[0]?.[0] as { action: string }
    expect(auditArgs.action).toBe('approval.granted')
  })

  it('maps decline to declined + approval.declined audit', async () => {
    const deps = makeDeps({
      payloadFindByID: vi.fn(async () => pendingApproval),
    })
    await callTool(createRespondToApprovalTool(deps), {
      approvalId: 'apr_1',
      decision: 'decline',
      notes: 'Wrong tone',
    })
    expect(deps.auditMock.mock.calls[0]?.[0].action).toBe('approval.declined')
  })

  it('maps request_changes to changes-requested + approval.changes_requested audit', async () => {
    const deps = makeDeps({
      payloadFindByID: vi.fn(async () => pendingApproval),
    })
    await callTool(createRespondToApprovalTool(deps), {
      approvalId: 'apr_1',
      decision: 'request_changes',
      notes: 'Tighten the second paragraph',
    })
    expect(deps.auditMock.mock.calls[0]?.[0].action).toBe('approval.changes_requested')
  })

  it('rejects responding to an already-decided approval', async () => {
    const deps = makeDeps({
      payloadFindByID: vi.fn(async () => ({ ...pendingApproval, status: 'granted' })),
    })
    const result = (await callTool(createRespondToApprovalTool(deps), {
      approvalId: 'apr_1',
      decision: 'approve',
    })) as { error?: string }
    expect(result.error).toMatch(/already granted/)
    expect(deps.spies.payloadUpdate).not.toHaveBeenCalled()
  })

  it('blocks self-approval', async () => {
    const deps = makeDeps({
      payloadFindByID: vi.fn(async () => ({ ...pendingApproval, requestedBy: 'usr_1' })),
    })
    const result = (await callTool(createRespondToApprovalTool(deps), {
      approvalId: 'apr_1',
      decision: 'approve',
    })) as { error?: string }
    expect(result.error).toMatch(/own request/)
  })

  it('rejects users not in any approver group for the request', async () => {
    const deps = makeDeps({
      payloadFindByID: vi.fn(async () => ({ ...pendingApproval, approverGroups: ['legal'] })),
    })
    const result = (await callTool(createRespondToApprovalTool(deps), {
      approvalId: 'apr_1',
      decision: 'approve',
    })) as { error?: string }
    expect(result.error).toMatch(/not in an approver group/)
  })

  it('rejects unauthenticated callers', async () => {
    const deps = makeDeps()
    const result = (await callTool(
      createRespondToApprovalTool(deps),
      { approvalId: 'apr_1', decision: 'approve' },
      makeContext({ user: null }),
    )) as { error?: string }
    expect(result.error).toMatch(/authenticated/)
  })
})

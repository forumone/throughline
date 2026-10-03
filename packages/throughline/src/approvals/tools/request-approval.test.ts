import { describe, expect, it, vi } from 'vitest'
import { createRequestApprovalTool } from './request-approval.js'
import { callTool, makeContext, makeDeps } from './_test-helpers.js'

describe('request_approval', () => {
  it('creates a pending approval, fires approval/requested, and audits', async () => {
    const deps = makeDeps()
    const tool = createRequestApprovalTool(deps)

    const result = (await callTool(tool, {
      collection: 'pages',
      id: 'p1',
      changesSummary: 'Updated headline copy and added a new program section.',
      approverGroups: ['editorial'],
    })) as { approvalId: string; status: string; expiresAt: string; approvers: Array<{ id: string }> }

    expect(result.approvalId).toBe('apr_1')
    expect(result.status).toBe('pending')
    expect(result.approvers.map((a) => a.id)).toEqual(['usr_2'])
    expect(deps.spies.payloadCreate).toHaveBeenCalled()
    const eventArgs = deps.spies.inngestSend.mock.calls[0]?.[0] as { name: string }
    expect(eventArgs.name).toBe('approval/requested')
    const auditArgs = deps.auditMock.mock.calls[0]?.[0] as { action: string; success: boolean }
    expect(auditArgs.action).toBe('approval.requested')
    expect(auditArgs.success).toBe(true)
  })

  it('rejects unknown approver groups', async () => {
    const deps = makeDeps()
    const result = (await callTool(createRequestApprovalTool(deps), {
      collection: 'pages',
      id: 'p1',
      changesSummary: 'Some sufficiently long summary for the approver to read carefully.',
      approverGroups: ['ghost'],
    })) as { error?: string }
    expect(result.error).toMatch(/Unknown approver groups/)
    expect(deps.spies.payloadCreate).not.toHaveBeenCalled()
  })

  it('rejects when no approvers resolve in the chosen groups', async () => {
    const deps = makeDeps({
      optionsOverrides: {
        groupResolver: { resolveUsers: async () => [] },
      } as never,
    })
    const result = (await callTool(createRequestApprovalTool(deps), {
      collection: 'pages',
      id: 'p1',
      changesSummary: 'Some sufficiently long summary text for the approver review.',
      approverGroups: ['editorial'],
    })) as { error?: string }
    expect(result.error).toMatch(/No approvers found/)
  })

  it('rejects unauthenticated callers', async () => {
    const deps = makeDeps()
    const result = (await callTool(
      createRequestApprovalTool(deps),
      {
        collection: 'pages',
        id: 'p1',
        changesSummary: 'Some sufficiently long summary for the approver to read.',
        approverGroups: ['editorial'],
      },
      makeContext({ user: null }),
    )) as { error?: string }
    expect(result.error).toMatch(/authenticated/)
  })

  it('rejects when document is not found', async () => {
    const deps = makeDeps({
      payloadFindByID: vi.fn(async () => null),
    })
    const result = (await callTool(createRequestApprovalTool(deps), {
      collection: 'pages',
      id: 'p1',
      changesSummary: 'Some sufficiently long summary for the approver to read.',
      approverGroups: ['editorial'],
    })) as { error?: string }
    expect(result.error).toMatch(/Document not found/)
  })

  it('forwards _meta into the audit record', async () => {
    const deps = makeDeps()
    await callTool(createRequestApprovalTool(deps), {
      collection: 'pages',
      id: 'p1',
      changesSummary: 'Updated the homepage hero copy with the new program announcement.',
      approverGroups: ['editorial'],
      _meta: { userPrompt: 'Send for review', reasoning: 'Marketing wants this live tomorrow' },
    })
    const auditArgs = deps.auditMock.mock.calls[0]?.[0] as { prompt?: string; reasoning?: string }
    expect(auditArgs.prompt).toBe('Send for review')
    expect(auditArgs.reasoning).toBe('Marketing wants this live tomorrow')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createAuditEventEchoFunction } from './audit-event-echo.js'
import { createFakeInngest } from './_test-helpers.js'

describe('createAuditEventEchoFunction', () => {
  it('subscribes to audit/event.recorded', () => {
    const fakeInngest = createFakeInngest()
    createAuditEventEchoFunction({ inngest: fakeInngest.inngest })
    const triggers = fakeInngest.functions[0]?.options['triggers'] as Array<{ event: string }>
    expect(triggers).toEqual([{ event: 'audit/event.recorded' }])
  })

  it('fires send-approval-request for approval.requested', async () => {
    const fakeInngest = createFakeInngest()
    createAuditEventEchoFunction({ inngest: fakeInngest.inngest })
    await fakeInngest.invoke('audit-event-echo', {
      name: 'audit/event.recorded',
      data: { action: 'approval.requested', approvalRequestId: 'req-1' },
    })
    expect(fakeInngest.sends).toEqual([
      { name: 'notification/send-approval-request', data: { approvalId: 'req-1' } },
    ])
  })

  it('fires send-approval-decision for granted / declined / changes_requested', async () => {
    for (const action of ['approval.granted', 'approval.declined', 'approval.changes_requested']) {
      const fakeInngest = createFakeInngest()
      createAuditEventEchoFunction({ inngest: fakeInngest.inngest })
      await fakeInngest.invoke('audit-event-echo', {
        name: 'audit/event.recorded',
        data: { action, approvalRequestId: 'req-x' },
      })
      expect(fakeInngest.sends).toEqual([
        {
          name: 'notification/send-approval-decision',
          data: { approvalId: 'req-x', decision: action },
        },
      ])
    }
  })

  it('does not fire when approvalRequestId is missing', async () => {
    const fakeInngest = createFakeInngest()
    createAuditEventEchoFunction({ inngest: fakeInngest.inngest })
    await fakeInngest.invoke('audit-event-echo', {
      name: 'audit/event.recorded',
      data: { action: 'approval.requested' },
    })
    expect(fakeInngest.sends).toEqual([])
  })

  it('runs custom handlers when their match returns true', async () => {
    const fakeInngest = createFakeInngest()
    const handle = vi.fn(async () => {})
    createAuditEventEchoFunction({
      inngest: fakeInngest.inngest,
      handlers: [
        {
          match: (e) => e.action === 'integration.failed',
          handle,
        },
        {
          match: (e) => e.action === 'never-matches',
          handle: async () => {
            throw new Error('should not run')
          },
        },
      ],
    })

    await fakeInngest.invoke('audit-event-echo', {
      name: 'audit/event.recorded',
      data: { action: 'integration.failed', integrationId: 'webhook-x' },
    })
    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle).toHaveBeenCalledWith({
      action: 'integration.failed',
      data: expect.objectContaining({ action: 'integration.failed' }),
    })
  })
})

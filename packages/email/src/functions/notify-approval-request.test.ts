import { describe, expect, it } from 'vitest'
import { createNotifyApprovalRequestFunction } from './notify-approval-request.js'
import {
  createFakeEmailClient,
  createFakeInngest,
  createFakePayload,
} from './_test-helpers.js'
import { defaultTokens } from '../tokens.js'
import type { EmailPluginOptions } from '../options.js'

const baseApproval = {
  id: 'a-1',
  targetCollection: 'pages',
  targetId: 'p-home',
  targetTitle: 'Homepage',
  changesSummary: 'Tightened the headline.',
  previewUrl: 'https://example.com/preview/abc',
  requestReason: 'Marketing wants this live.',
  requestedBy: { id: 'u-grace' },
  approverGroups: ['editorial'],
  notifiedApprovers: [{ id: 'u-ada' }, 'u-bob'],
  expiresAt: '2026-05-05T00:00:00.000Z',
}

function makeOptions(overrides: Partial<EmailPluginOptions> = {}): EmailPluginOptions {
  return {
    inngest: undefined as never,
    apiKey: 'k',
    fromAddress: 'a@example.com',
    resolveApprover: async (id) => ({ email: `${id}@example.com`, name: id.toUpperCase() }),
    resolveRequester: async (id) => ({ email: `${id}@example.com`, name: id.toUpperCase() }),
    buildActionUrl: async ({ approvalId, action, approverId }) =>
      `https://example.com/api/approvals/action?token=${approvalId}-${action}-${approverId}`,
    ...overrides,
  }
}

describe('createNotifyApprovalRequestFunction', () => {
  it('subscribes to notification/send-approval-request', () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({ 'a-1': baseApproval })
    const client = createFakeEmailClient()
    createNotifyApprovalRequestFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions(),
    })
    const triggers = fake.functions[0]?.options['triggers'] as Array<{ event: string }>
    expect(triggers).toEqual([{ event: 'notification/send-approval-request' }])
  })

  it('sends one email per approver with action URLs and tags', async () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({ 'a-1': baseApproval })
    const client = createFakeEmailClient()
    createNotifyApprovalRequestFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions(),
    })
    const result = (await fake.invoke('notify-approval-request', {
      name: 'notification/send-approval-request',
      data: { approvalId: 'a-1' },
    })) as { sent: number }

    expect(result.sent).toBe(2)
    expect(client.sends).toHaveLength(2)
    expect(client.sends[0]?.to).toBe('u-ada@example.com')
    expect(client.sends[1]?.to).toBe('u-bob@example.com')
    expect(client.sends[0]?.subject).toBe('Approval needed: Homepage')
    expect(client.sends[0]?.tags).toEqual([
      { name: 'type', value: 'approval-request' },
      { name: 'approval-id', value: 'a-1' },
    ])
  })

  it('skips when the approval has no notified approvers', async () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({
      'a-2': { ...baseApproval, id: 'a-2', notifiedApprovers: [] },
    })
    const client = createFakeEmailClient()
    createNotifyApprovalRequestFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions(),
    })
    const result = (await fake.invoke('notify-approval-request', {
      name: 'notification/send-approval-request',
      data: { approvalId: 'a-2' },
    })) as { sent?: number; reason?: string }
    expect(result.sent).toBe(0)
    expect(result.reason).toBe('no-approvers')
    expect(client.sends).toHaveLength(0)
  })

  it('skips an approver whose email cannot be resolved', async () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({ 'a-1': baseApproval })
    const client = createFakeEmailClient()
    createNotifyApprovalRequestFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions({
        resolveApprover: async (id) =>
          id === 'u-bob' ? null : { email: `${id}@example.com`, name: id.toUpperCase() },
      }),
    })
    const result = (await fake.invoke('notify-approval-request', {
      name: 'notification/send-approval-request',
      data: { approvalId: 'a-1' },
    })) as { sent: number }
    expect(result.sent).toBe(1)
    expect(client.sends).toHaveLength(1)
    expect(client.sends[0]?.to).toBe('u-ada@example.com')
  })

  it('skips when no approvalId is on the event', async () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({})
    const client = createFakeEmailClient()
    createNotifyApprovalRequestFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions(),
    })
    const result = (await fake.invoke('notify-approval-request', {
      name: 'notification/send-approval-request',
      data: {},
    })) as { skipped: boolean }
    expect(result.skipped).toBe(true)
  })
})

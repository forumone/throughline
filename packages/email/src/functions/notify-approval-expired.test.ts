import { describe, expect, it } from 'vitest'
import { createNotifyApprovalExpiredFunction } from './notify-approval-expired.js'
import {
  createFakeEmailClient,
  createFakeInngest,
  createFakePayload,
} from './_test-helpers.js'
import { defaultTokens } from '../tokens.js'
import type { EmailPluginOptions } from '../options.js'

function makeOptions(overrides: Partial<EmailPluginOptions> = {}): EmailPluginOptions {
  return {
    inngest: undefined as never,
    apiKey: 'k',
    fromAddress: 'a@example.com',
    resolveApprover: async (id) => ({ email: `${id}@example.com`, name: id.toUpperCase() }),
    resolveRequester: async (id) => ({ email: `${id}@example.com`, name: id.toUpperCase() }),
    buildActionUrl: async () => 'https://example.com/x',
    ...overrides,
  }
}

describe('createNotifyApprovalExpiredFunction', () => {
  it('subscribes to approval/expired', () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({})
    const client = createFakeEmailClient()
    createNotifyApprovalExpiredFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions(),
    })
    const triggers = fake.functions[0]?.options['triggers'] as Array<{ event: string }>
    expect(triggers).toEqual([{ event: 'approval/expired' }])
  })

  it('emails the requester with the expired template', async () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({
      'a-1': {
        id: 'a-1',
        targetTitle: 'Homepage',
        requestedBy: { id: 'u-grace' },
        requestedAt: '2026-04-15T00:00:00.000Z',
      },
    })
    const client = createFakeEmailClient()
    createNotifyApprovalExpiredFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions(),
    })

    const result = (await fake.invoke('notify-approval-expired', {
      name: 'approval/expired',
      data: { approvalId: 'a-1' },
    })) as { sent: number }
    expect(result.sent).toBe(1)
    expect(client.sends[0]?.to).toBe('u-grace@example.com')
    expect(client.sends[0]?.subject).toBe('Approval expired: Homepage')
  })

  it('uses requesterId from event data when present (cron path)', async () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({
      'a-1': {
        id: 'a-1',
        targetTitle: 'Homepage',
        requestedBy: { id: 'u-grace' },
        requestedAt: '2026-04-15T00:00:00.000Z',
      },
    })
    const client = createFakeEmailClient()
    createNotifyApprovalExpiredFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions({
        resolveRequester: async (id) =>
          id === 'event-grace' ? { email: 'event-grace@example.com', name: 'Event Grace' } : null,
      }),
    })
    await fake.invoke('notify-approval-expired', {
      name: 'approval/expired',
      data: { approvalId: 'a-1', requesterId: 'event-grace' },
    })
    expect(client.sends[0]?.to).toBe('event-grace@example.com')
  })

  it('skips when the approval cannot be loaded', async () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({})
    const client = createFakeEmailClient()
    createNotifyApprovalExpiredFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions(),
    })
    const result = (await fake.invoke('notify-approval-expired', {
      name: 'approval/expired',
      data: { approvalId: 'gone' },
    })) as { skipped: boolean }
    expect(result.skipped).toBe(true)
    expect(client.sends).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import { createNotifyApprovalDecisionFunction } from './notify-approval-decision.js'
import {
  createFakeEmailClient,
  createFakeInngest,
  createFakePayload,
} from './_test-helpers.js'
import { defaultTokens } from '../tokens.js'
import type { EmailPluginOptions } from '../options.js'

const baseApproval = {
  id: 'a-1',
  targetTitle: 'Homepage',
  previewUrl: 'https://example.com/preview/abc',
  requestedBy: { id: 'u-grace' },
  decidedBy: { id: 'u-ada' },
  decisionNotes: 'Looks good, ship it.',
}

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

describe('createNotifyApprovalDecisionFunction', () => {
  it('subscribes to notification/send-approval-decision', () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({ 'a-1': baseApproval })
    const client = createFakeEmailClient()
    createNotifyApprovalDecisionFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions(),
    })
    const triggers = fake.functions[0]?.options['triggers'] as Array<{ event: string }>
    expect(triggers).toEqual([{ event: 'notification/send-approval-decision' }])
  })

  it.each([
    ['approval.granted', 'Approved: Homepage'],
    ['approval.declined', 'Not approved: Homepage'],
    ['approval.changes_requested', 'Changes requested on Homepage'],
  ])('renders the right subject for %s', async (action, expectedSubject) => {
    const fake = createFakeInngest()
    const payload = createFakePayload({ 'a-1': baseApproval })
    const client = createFakeEmailClient()
    createNotifyApprovalDecisionFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions(),
    })
    await fake.invoke('notify-approval-decision', {
      name: 'notification/send-approval-decision',
      data: { approvalId: 'a-1', decision: action },
    })
    expect(client.sends[0]?.subject).toBe(expectedSubject)
    expect(client.sends[0]?.tags).toContainEqual({ name: 'type', value: 'approval-decision' })
  })

  it('sends to the requester not the decider', async () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({ 'a-1': baseApproval })
    const client = createFakeEmailClient()
    createNotifyApprovalDecisionFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions(),
    })
    await fake.invoke('notify-approval-decision', {
      name: 'notification/send-approval-decision',
      data: { approvalId: 'a-1', decision: 'approval.granted' },
    })
    expect(client.sends[0]?.to).toBe('u-grace@example.com')
  })

  it('skips unknown decisions', async () => {
    const fake = createFakeInngest()
    const payload = createFakePayload({ 'a-1': baseApproval })
    const client = createFakeEmailClient()
    createNotifyApprovalDecisionFunction({
      inngest: fake.inngest,
      payload,
      client,
      tokens: defaultTokens,
      options: makeOptions(),
    })
    const result = (await fake.invoke('notify-approval-decision', {
      name: 'notification/send-approval-decision',
      data: { approvalId: 'a-1', decision: 'not-a-real-action' },
    })) as { skipped: boolean; reason?: string }
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('unknown-decision')
    expect(client.sends).toHaveLength(0)
  })
})

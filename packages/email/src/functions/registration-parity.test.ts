import { describe, expect, it } from 'vitest'
import type { EmailPluginOptions } from '../options.js'
import { defaultTokens } from '../tokens.js'
import { createFakeEmailClient, createFakeInngest, createFakePayload } from './_test-helpers.js'
import { createNotifyApprovalDecisionFunction } from './notify-approval-decision.js'
import { createNotifyApprovalExpiredFunction } from './notify-approval-expired.js'
import { createNotifyApprovalRequestFunction } from './notify-approval-request.js'

/*
What each notification registers with Inngest, frozen before the three moved
onto `defineJob`, and held unchanged after. See the same test in
`@forumone/throughline-workflows` for why a drift here matters.
*/

const options = {
  inngest: undefined as never,
  apiKey: 'k',
  fromAddress: 'a@example.com',
  resolveApprover: async () => null,
  resolveRequester: async () => null,
  buildActionUrl: async () => 'https://example.com/x',
} as EmailPluginOptions

function registered(build: typeof createNotifyApprovalRequestFunction) {
  const fake = createFakeInngest()
  build({
    inngest: fake.inngest,
    payload: createFakePayload({}),
    client: createFakeEmailClient(),
    tokens: defaultTokens,
    options,
  })
  const config = fake.functions[0]?.options ?? {}
  return Object.fromEntries(Object.entries(config).sort(([a], [b]) => a.localeCompare(b)))
}

describe('notification registrations', () => {
  it('notify-approval-request', () => {
    expect(registered(createNotifyApprovalRequestFunction)).toMatchInlineSnapshot(`
      {
        "id": "notify-approval-request",
        "retries": 3,
        "triggers": [
          {
            "event": "notification/send-approval-request",
          },
        ],
      }
    `)
  })
  it('notify-approval-decision', () => {
    expect(registered(createNotifyApprovalDecisionFunction)).toMatchInlineSnapshot(`
      {
        "id": "notify-approval-decision",
        "retries": 3,
        "triggers": [
          {
            "event": "notification/send-approval-decision",
          },
        ],
      }
    `)
  })
  it('notify-approval-expired', () => {
    expect(registered(createNotifyApprovalExpiredFunction)).toMatchInlineSnapshot(`
      {
        "id": "notify-approval-expired",
        "retries": 3,
        "triggers": [
          {
            "event": "approval/expired",
          },
        ],
      }
    `)
  })
})

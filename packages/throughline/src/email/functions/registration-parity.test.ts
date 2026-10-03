import { describe, expect, it } from 'vitest'
import type { EmailPluginOptions } from '../options.js'
import { defaultTokens } from '../tokens.js'
import {
  createFakeEmailClient,
  createFakeInngest,
  createFakePayload,
  notifyFunction,
} from './_test-helpers.js'
import { notifyApprovalDecisionJob } from './notify-approval-decision.js'
import { notifyApprovalExpiredJob } from './notify-approval-expired.js'
import { notifyApprovalRequestJob } from './notify-approval-request.js'

/*
What each notification registers with Inngest, frozen before the three moved
onto `defineJob`, and held unchanged after. See `jobs/function-ids.test.ts`
in `@forumone/throughline` for why a drift here matters.
*/

const options = {
  inngest: undefined as never,
  apiKey: 'k',
  fromAddress: 'a@example.com',
  resolveApprover: async () => null,
  resolveRequester: async () => null,
  buildActionUrl: async () => 'https://example.com/x',
} as EmailPluginOptions

function registered(build: typeof notifyApprovalRequestJob) {
  const fake = createFakeInngest()
  notifyFunction(build, {
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
    expect(registered(notifyApprovalRequestJob)).toMatchInlineSnapshot(`
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
    expect(registered(notifyApprovalDecisionJob)).toMatchInlineSnapshot(`
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
    expect(registered(notifyApprovalExpiredJob)).toMatchInlineSnapshot(`
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

describe('a terminal-failure handler', () => {
  /*
  The three ran with none, so a notification that exhausted its retries was
  silent: they were three of the five forumone-2026 functions with no
  "(failure)" registration. `emailPlugin` now passes one.
  */
  it.each([notifyApprovalRequestJob, notifyApprovalDecisionJob, notifyApprovalExpiredJob])(
    'is registered when given, and changes nothing else',
    (build) => {
      const onFailure = async () => undefined
      const fake = createFakeInngest()
      notifyFunction(build, {
        inngest: fake.inngest,
        payload: createFakePayload({}),
        client: createFakeEmailClient(),
        tokens: defaultTokens,
        options,
        onFailure,
      })
      const { onFailure: given, ...rest } = (fake.functions[0]?.options ?? {}) as Record<
        string,
        unknown
      >
      expect(given).toBe(onFailure)
      expect(
        Object.fromEntries(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b))),
      ).toEqual(registered(build))
    },
  )
})

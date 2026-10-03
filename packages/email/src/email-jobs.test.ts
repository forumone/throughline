import type { JobContext } from '@forumone/throughline/jobs'
import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'
import { createFakeEmailClient, createFakePayload } from './functions/_test-helpers.js'
import type { EmailPluginOptions } from './options.js'
import { emailJobs } from './plugin.js'

/*
`emailJobs`, the notifications for a runner whose jobs are declared before
Payload exists. Each job finds Payload on its context, and the email client
on Payload, when it runs.
*/

const options: EmailPluginOptions = {
  apiKey: 're_test_key',
  fromAddress: 'a@example.com',
  resolveApprover: async (id) => ({ email: `${id}@example.com`, name: id }),
  resolveRequester: async (id) => ({ email: `${id}@example.com`, name: id }),
  buildActionUrl: async () => 'https://example.com/x',
}

const EMAIL_CLIENT = Symbol.for('@forumone/throughline/email-client')

function context(payload: Payload | undefined, data: unknown): JobContext {
  return {
    event: { name: 'approval/expired', data },
    step: {
      run: async (_id, fn) => fn(),
      sleepUntil: async () => undefined,
      sendEvent: async () => undefined,
    },
    runId: 'run-1',
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    emit: async () => undefined,
    ...(payload ? { payload } : {}),
  }
}

describe('emailJobs', () => {
  it('is the three notifications, with no Inngest client needed', () => {
    const jobs = emailJobs(options)
    expect(jobs.map((job) => [job.id, job.on])).toEqual([
      ['notify-approval-request', { event: 'notification/send-approval-request' }],
      ['notify-approval-decision', { event: 'notification/send-approval-decision' }],
      ['notify-approval-expired', { event: 'approval/expired' }],
    ])
  })

  it('sends through the client emailPlugin put on Payload', async () => {
    const payload = createFakePayload({
      'a-1': { id: 'a-1', targetTitle: 'Homepage', requestedBy: { id: 'u-grace' } },
    })
    const client = createFakeEmailClient()
    Object.defineProperty(payload, EMAIL_CLIENT, { value: client })

    const expired = emailJobs(options).find((job) => job.id === 'notify-approval-expired')!
    await expired.handler(context(payload, { approvalId: 'a-1' }))

    expect(client.sends[0]?.to).toBe('u-grace@example.com')
  })

  it('says what is missing when the runner gave it no Payload, or emailPlugin is not registered', async () => {
    const [request] = emailJobs(options)
    await expect(request!.handler(context(undefined, {}))).rejects.toThrow(/no Payload instance/)
    await expect(
      request!.handler(context(createFakePayload({}), { approvalId: 'a-1' })),
    ).rejects.toThrow(/Register emailPlugin/)
  })
})

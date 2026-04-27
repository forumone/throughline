import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExpireStaleApprovalsFunction } from './expire-stale-approvals.js'
import { createFakeInngest, createFakePayload } from './_test-helpers.js'

const AUDIT_WRITER_SYMBOL = Symbol.for('@forumone/throughline/audit-writer')

interface AuditWriteCall {
  action: string
  approvalRequestId?: string
  targetTitle?: string
}

function attachAuditWriter(payload: object): AuditWriteCall[] {
  const calls: AuditWriteCall[] = []
  Object.defineProperty(payload, AUDIT_WRITER_SYMBOL, {
    value: async (event: AuditWriteCall) => {
      calls.push(event)
    },
    enumerable: false,
    writable: false,
    configurable: true,
  })
  return calls
}

describe('createExpireStaleApprovalsFunction', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers a daily cron at 2am by default', () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    attachAuditWriter(payloadHandle.payload as object)
    createExpireStaleApprovalsFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
    })
    const triggers = fakeInngest.functions[0]?.options['triggers'] as Array<{ cron: string }>
    expect(triggers).toEqual([{ cron: '0 2 * * *' }])
  })

  it('returns 0 when nothing is expired', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload()
    attachAuditWriter(payloadHandle.payload as object)
    createExpireStaleApprovalsFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
    })
    const result = (await fakeInngest.invoke('expire-stale-approvals', {
      name: 'inngest/function.invoked',
      data: {},
    })) as { expiredCount: number }
    expect(result.expiredCount).toBe(0)
  })

  it('expires pending approvals past expiresAt, writes audit, and fires approval/expired', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload([
      {
        id: 'a-1',
        status: 'pending',
        expiresAt: '2026-04-21T00:00:00.000Z',
        targetCollection: 'pages',
        targetId: 'p-home',
        targetTitle: 'Homepage',
        requestedBy: { id: 'u-ada' },
      },
      {
        id: 'a-2',
        status: 'pending',
        expiresAt: '2026-04-23T00:00:00.000Z',
        targetCollection: 'pages',
        targetId: 'p-about',
        targetTitle: 'About',
        requestedBy: 'u-grace',
      },
    ])
    const auditCalls = attachAuditWriter(payloadHandle.payload as object)

    createExpireStaleApprovalsFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
    })

    const result = (await fakeInngest.invoke('expire-stale-approvals', {
      name: 'inngest/function.invoked',
      data: {},
    })) as { expiredCount: number }

    expect(result.expiredCount).toBe(1)
    expect(payloadHandle.updates).toEqual([
      { collection: 'approvals', id: 'a-1', data: { status: 'expired' } },
    ])
    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0]).toMatchObject({
      action: 'approval.expired',
      approvalRequestId: 'a-1',
      targetTitle: 'Homepage',
    })
    expect(fakeInngest.sends).toEqual([
      {
        name: 'approval/expired',
        data: {
          approvalId: 'a-1',
          requesterId: 'u-ada',
          targetCollection: 'pages',
          targetId: 'p-home',
        },
      },
    ])
  })

  it('honors a custom collectionSlug', async () => {
    const fakeInngest = createFakeInngest()
    const payloadHandle = createFakePayload([
      {
        id: 'a-1',
        status: 'pending',
        expiresAt: '2026-04-21T00:00:00.000Z',
        targetCollection: 'pages',
        targetId: 'p-home',
        targetTitle: 'Home',
        requestedBy: 'u-ada',
      },
    ])
    attachAuditWriter(payloadHandle.payload as object)
    createExpireStaleApprovalsFunction({
      inngest: fakeInngest.inngest,
      payload: payloadHandle.payload,
      collectionSlug: 'workflow-approvals',
    })
    await fakeInngest.invoke('expire-stale-approvals', {
      name: 'inngest/function.invoked',
      data: {},
    })
    expect(payloadHandle.finds[0]?.collection).toBe('workflow-approvals')
    expect(payloadHandle.updates[0]?.collection).toBe('workflow-approvals')
  })
})

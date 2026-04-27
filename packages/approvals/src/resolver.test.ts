import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { attachApprovalResolver, createApprovalResolver } from './resolver.js'

function fakePayload(docs: Array<Record<string, unknown>>) {
  const find = vi.fn(async () => ({ docs, totalDocs: docs.length }))
  return { payload: { find } as unknown as Payload, find }
}

describe('createApprovalResolver', () => {
  it('returns null when no granted approval exists for the version', async () => {
    const { payload, find } = fakePayload([])
    const resolver = createApprovalResolver({ payload })
    const result = await resolver.getActiveApproval('pages', 'p1', 'v1')
    expect(result).toBeNull()
    const args = find.mock.calls[0]?.[0] as { where: { and: Array<{ targetVersion: { equals: string } }> } }
    expect(args.where.and[2]?.targetVersion.equals).toBe('v1')
  })

  it('returns the approval mapped to the ActiveApproval shape', async () => {
    const { payload } = fakePayload([
      {
        id: 'apr_1',
        decidedAt: '2026-04-22T12:00:00.000Z',
        decidedBy: 'usr_1',
        targetVersion: 'v1',
      },
    ])
    const resolver = createApprovalResolver({ payload })
    const result = await resolver.getActiveApproval('pages', 'p1', 'v1')
    expect(result).toEqual({
      id: 'apr_1',
      grantedAt: '2026-04-22T12:00:00.000Z',
      grantedBy: 'usr_1',
      version: 'v1',
    })
  })

  it('unwraps a populated decidedBy relationship', async () => {
    const { payload } = fakePayload([
      {
        id: 'apr_1',
        decidedAt: '2026-04-22T12:00:00.000Z',
        decidedBy: { id: 'usr_2', email: 'a@b' },
        targetVersion: 'v1',
      },
    ])
    const resolver = createApprovalResolver({ payload })
    const result = await resolver.getActiveApproval('pages', 'p1', 'v1')
    expect(result?.grantedBy).toBe('usr_2')
  })

  it('honors a custom collection slug', async () => {
    const { payload, find } = fakePayload([])
    const resolver = createApprovalResolver({ payload, collectionSlug: 'my-approvals' })
    await resolver.getActiveApproval('pages', 'p1', 'v1')
    const args = find.mock.calls[0]?.[0] as { collection: string }
    expect(args.collection).toBe('my-approvals')
  })
})

describe('attachApprovalResolver', () => {
  it('makes the resolver discoverable via Symbol.for', async () => {
    const { payload } = fakePayload([])
    const resolver = createApprovalResolver({ payload })
    const target: object = {}
    attachApprovalResolver(target, resolver)
    const symbol = Symbol.for('@forumone/throughline/approvals-resolver')
    expect((target as Record<symbol, unknown>)[symbol]).toBe(resolver)
  })
})

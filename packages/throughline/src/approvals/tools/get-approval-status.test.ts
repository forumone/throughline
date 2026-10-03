import { describe, expect, it, vi } from 'vitest'
import { createGetApprovalStatusTool } from './get-approval-status.js'
import { callTool, makeContext, makeDeps } from './_test-helpers.js'

/*
Audit 04 F-20: this tool had no authorization check of any kind.

`makeContext()` is `usr_1`, roles `['editor']`, groups `['editorial']`. The
fixture below is requested by somebody else and routed to a group that user is
not in, so the default caller is a stranger to it — which makes "refused" the
default assertion and each allowed case say in its own name why it is allowed.
*/
const approval = {
  id: 'apr_1',
  status: 'granted',
  targetCollection: 'pages',
  targetId: 'p1',
  targetTitle: 'Climate program',
  targetVersion: 'v3',
  approverGroups: ['legal'],
  requestedBy: 'usr_3',
  requestedAt: '2026-04-23T12:00:00.000Z',
  decidedBy: 'usr_2',
  decidedAt: '2026-04-24T09:00:00.000Z',
  decisionNotes: 'Reads well.',
  expiresAt: '2026-04-30T12:00:00.000Z',
}

describe('get_approval_status', () => {
  it('refuses an unauthenticated caller', async () => {
    const deps = makeDeps({ payloadFindByID: vi.fn(async () => approval) })

    const result = (await callTool(
      createGetApprovalStatusTool(deps),
      { approvalId: 'apr_1' },
      makeContext({ user: null }),
    )) as { error?: string }

    expect(result.error).toMatch(/Must be authenticated/)
  })

  /*
  The refusal has to come before the read, or an unauthenticated caller can
  still tell a real id from an invented one by how long the call takes and
  which sentence comes back.
  */
  it('refuses before reading anything', async () => {
    const deps = makeDeps({ payloadFindByID: vi.fn(async () => approval) })

    await callTool(
      createGetApprovalStatusTool(deps),
      { approvalId: 'apr_1' },
      makeContext({ user: null }),
    )

    expect(deps.spies.payloadFindByID).not.toHaveBeenCalled()
  })

  it('refuses a caller who is neither the requester nor in an approver group', async () => {
    const deps = makeDeps({ payloadFindByID: vi.fn(async () => approval) })

    const result = (await callTool(createGetApprovalStatusTool(deps), {
      approvalId: 'apr_1',
    })) as { error?: string; status?: string }

    expect(result.error).toBe('Approval not found')
    expect(result.status).toBeUndefined()
  })

  /*
  The same sentence as a genuine miss, deliberately. Ids are sequential, so a
  refusal that reads differently from "no such approval" is an enumeration
  oracle over who is asking whom to approve what.
  */
  it('refuses in the same words as a missing approval', async () => {
    const present = makeDeps({ payloadFindByID: vi.fn(async () => approval) })
    const absent = makeDeps({ payloadFindByID: vi.fn(async () => null) })

    const refused = (await callTool(createGetApprovalStatusTool(present), {
      approvalId: 'apr_1',
    })) as { error?: string }
    const missing = (await callTool(createGetApprovalStatusTool(absent), {
      approvalId: 'apr_999',
    })) as { error?: string }

    expect(refused.error).toBe(missing.error)
  })

  it('answers the requester', async () => {
    const deps = makeDeps({
      payloadFindByID: vi.fn(async () => ({ ...approval, requestedBy: 'usr_1' })),
    })

    const result = (await callTool(createGetApprovalStatusTool(deps), {
      approvalId: 'apr_1',
    })) as { status?: string; decisionNotes?: string }

    expect(result.status).toBe('granted')
    expect(result.decisionNotes).toBe('Reads well.')
  })

  it('answers a member of an approver group', async () => {
    const deps = makeDeps({
      payloadFindByID: vi.fn(async () => ({ ...approval, approverGroups: ['editorial'] })),
    })

    const result = (await callTool(createGetApprovalStatusTool(deps), {
      approvalId: 'apr_1',
    })) as { approvalId?: string; decidedBy?: string }

    expect(result.approvalId).toBe('apr_1')
    expect(result.decidedBy).toBe('usr_2')
  })

  /*
  `requestedBy` arrives as a populated object at depth and as an id otherwise.
  `unwrapRelationshipId` is what the other four tools use for the same reason,
  and the requester check has to go through it or a populated relationship
  compares as an object and never matches.
  */
  it('recognises the requester through a populated relationship', async () => {
    const deps = makeDeps({
      payloadFindByID: vi.fn(async () => ({
        ...approval,
        requestedBy: { id: 'usr_1', email: 'tester@example.com' },
      })),
    })

    const result = (await callTool(createGetApprovalStatusTool(deps), {
      approvalId: 'apr_1',
    })) as { status?: string; error?: string }

    expect(result.error).toBeUndefined()
    expect(result.status).toBe('granted')
  })

  it('refuses a caller whose groups are empty', async () => {
    const deps = makeDeps({ payloadFindByID: vi.fn(async () => approval) })

    const result = (await callTool(
      createGetApprovalStatusTool(deps),
      { approvalId: 'apr_1' },
      makeContext({
        user: {
          id: 'usr_9',
          email: 'nobody@example.com',
          name: 'Nobody',
          roles: [],
          groups: [],
        },
      }),
    )) as { error?: string }

    expect(result.error).toBe('Approval not found')
  })

  /*
  Not an admin bypass, and this asserts that rather than leaving it to the
  comment. `respond_to_approval` has none; a reader who adds one here has to
  delete a test that says why it is absent.
  */
  it('does not let an admin read an approval they are not party to', async () => {
    const deps = makeDeps({ payloadFindByID: vi.fn(async () => approval) })

    const result = (await callTool(
      createGetApprovalStatusTool(deps),
      { approvalId: 'apr_1' },
      makeContext({
        user: {
          id: 'usr_admin',
          email: 'admin@example.com',
          name: 'Admin',
          roles: ['admin'],
          groups: [],
        },
      }),
    )) as { error?: string }

    expect(result.error).toBe('Approval not found')
  })

  it('reads from the configured collection slug', async () => {
    const deps = makeDeps({
      payloadFindByID: vi.fn(async () => ({ ...approval, requestedBy: 'usr_1' })),
      optionsOverrides: { collectionSlug: 'approval-requests' },
    })

    await callTool(createGetApprovalStatusTool(deps), { approvalId: 'apr_1' })

    const args = deps.spies.payloadFindByID.mock.calls[0]?.[0] as { collection: string }
    expect(args.collection).toBe('approval-requests')
  })
})

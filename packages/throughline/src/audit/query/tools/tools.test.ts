import { describe, expect, it } from 'vitest'
import { createQueryAuditTool } from './query-audit.js'
import { createGetChangeHistoryTool } from './get-change-history.js'
import { createWhoChangedWhatTool } from './who-changed-what.js'
import { createWhatChangedInRangeTool } from './what-changed-in-range.js'
import { createGetRecentFailuresTool } from './get-recent-failures.js'
import { createFakePayload, makeContext, type FakeAuditDoc } from './_test-helpers.js'

const SLUG = 'audit-events'

const seed: FakeAuditDoc[] = [
  {
    id: 'a1',
    createdAt: '2026-04-22T10:00:00.000Z',
    actor: { type: 'user', userId: 'u-ada', userName: 'Ada' },
    action: 'publishing.publish',
    mcpServer: 'publishing',
    mcpTool: 'publish',
    targetCollection: 'pages',
    targetId: 'p-home',
    targetTitle: 'Homepage',
    summary: 'Published Homepage',
    success: true,
  },
  {
    id: 'a2',
    createdAt: '2026-04-22T09:00:00.000Z',
    actor: { type: 'user', userId: 'u-grace', userName: 'Grace' },
    action: 'content.update',
    mcpServer: 'payload',
    mcpTool: 'update',
    targetCollection: 'pages',
    targetId: 'p-home',
    summary: 'Updated headline',
    success: true,
    diff: { headline: { before: 'Old', after: 'New' } },
  },
  {
    id: 'a3',
    createdAt: '2026-04-22T08:00:00.000Z',
    actor: { type: 'integration', apiKeyName: 'ci-bot' },
    action: 'integration.failed',
    mcpServer: 'integrations',
    mcpTool: 'sync',
    summary: 'Sync failed',
    success: false,
    errorMessage: 'connection refused',
  },
  {
    id: 'a4',
    createdAt: '2026-04-21T08:00:00.000Z',
    actor: { type: 'user', userId: 'u-grace', userName: 'Grace' },
    action: 'content.update',
    mcpServer: 'payload',
    mcpTool: 'update',
    targetCollection: 'pages',
    targetId: 'p-about',
    summary: 'Updated About body',
  },
]

describe('createQueryAuditTool', () => {
  it('denies non-admin/non-editor callers', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createQueryAuditTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler({} as Record<string, never>, makeContext({
      user: { id: 'u-grace', email: 'g@x', name: 'Grace', roles: ['author'], groups: [] },
    }))) as { error?: string }
    expect(result.error).toMatch(/admins and editors/)
  })

  it('returns all events sorted desc when no filters', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createQueryAuditTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler({} as Record<string, never>, makeContext())) as {
      total: number
      events: Array<{ when: string; what: string }>
    }
    expect(result.total).toBe(4)
    expect(result.events).toHaveLength(4)
    expect(result.events[0]?.what).toBe('Published Homepage')
  })

  it('filters by targetCollection + onlyFailures', async () => {
    const { payload, calls } = createFakePayload(seed)
    const tool = createQueryAuditTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler(
      { onlyFailures: true } as Record<string, unknown>,
      makeContext(),
    )) as { events: Array<{ what: string; success: boolean }> }
    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.success).toBe(false)
    expect(calls[0]?.where?.and).toEqual([{ success: { equals: false } }])
  })

  it('filters by date range', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createQueryAuditTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler(
      {
        dateRange: { from: '2026-04-22T00:00:00.000Z', to: '2026-04-23T00:00:00.000Z' },
      } as Record<string, unknown>,
      makeContext(),
    )) as { events: Array<unknown> }
    expect(result.events).toHaveLength(3)
  })
})

describe('createGetChangeHistoryTool', () => {
  it('returns chronological history for a single document', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createGetChangeHistoryTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler(
      { targetCollection: 'pages', targetId: 'p-home' },
      makeContext(),
    )) as { eventCount: number; history: Array<{ what: string }> }
    expect(result.eventCount).toBe(2)
    expect(result.history.map((h) => h.what)).toEqual(['Published Homepage', 'Updated headline'])
  })

  it('denies non-readers', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createGetChangeHistoryTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler(
      { targetCollection: 'pages', targetId: 'p-home' },
      makeContext({
        user: { id: 'u-grace', email: 'g@x', name: 'Grace', roles: ['author'], groups: [] },
      }),
    )) as { error?: string }
    expect(result.error).toMatch(/admins and editors/)
  })
})

describe('createWhoChangedWhatTool', () => {
  it('defaults to the authenticated caller', async () => {
    const { payload, calls } = createFakePayload(seed)
    const tool = createWhoChangedWhatTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler(
      {} as Record<string, never>,
      makeContext({
        user: { id: 'u-grace', email: 'g@x', name: 'Grace', roles: ['author'], groups: [] },
      }),
    )) as { actorId: string; actor: string; actionCount: number }
    expect(result.actorId).toBe('u-grace')
    expect(result.actor).toBe('Grace')
    expect(result.actionCount).toBe(2)
    const condition = calls[0]?.where?.and?.[0]
    expect(condition?.['actor.userId']?.['equals']).toBe('u-grace')
  })

  it('lets admins look up other users', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createWhoChangedWhatTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler(
      { actorId: 'u-ada' },
      makeContext(),
    )) as { actorId: string; actionCount: number }
    expect(result.actorId).toBe('u-ada')
    expect(result.actionCount).toBe(1)
  })

  it('denies authors looking up other users', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createWhoChangedWhatTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler(
      { actorId: 'u-ada' },
      makeContext({
        user: { id: 'u-grace', email: 'g@x', name: 'Grace', roles: ['author'], groups: [] },
      }),
    )) as { error?: string }
    expect(result.error).toMatch(/Only admins and editors/)
  })

  it('rejects when there is no caller and no actorId', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createWhoChangedWhatTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler({}, makeContext({ user: null }))) as { error?: string }
    expect(result.error).toMatch(/no actorId/i)
  })
})

describe('createWhatChangedInRangeTool', () => {
  it('aggregates by action, actor, collection, and server', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createWhatChangedInRangeTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler(
      { from: '2026-04-22T00:00:00.000Z', to: '2026-04-22T23:59:59.000Z' },
      makeContext(),
    )) as {
      totalActions: number
      failureCount: number
      byAction: Record<string, number>
      topActors: Array<{ id: string; name: string; count: number }>
      byCollection: Record<string, number>
      byServer: Record<string, number>
    }
    expect(result.totalActions).toBe(3)
    expect(result.failureCount).toBe(1)
    expect(result.byAction['publishing.publish']).toBe(1)
    expect(result.byAction['content.update']).toBe(1)
    expect(result.byCollection['pages']).toBe(2)
    expect(result.byServer['payload']).toBe(1)
    expect(result.topActors[0]?.count).toBe(1)
  })

  it('denies non-readers', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createWhatChangedInRangeTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler(
      { from: '2026-04-22T00:00:00.000Z', to: '2026-04-22T23:59:59.000Z' },
      makeContext({
        user: { id: 'u-grace', email: 'g@x', name: 'Grace', roles: ['author'], groups: [] },
      }),
    )) as { error?: string }
    expect(result.error).toBeDefined()
  })
})

describe('createGetRecentFailuresTool', () => {
  it('returns only failed events within the window', async () => {
    const recent: FakeAuditDoc[] = [
      ...seed,
      {
        id: 'a-recent-fail',
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        actor: { type: 'system' },
        action: 'system.error',
        mcpServer: 'audit',
        mcpTool: 'heartbeat',
        summary: 'Something broke',
        success: false,
        errorMessage: 'boom',
      },
    ]
    const { payload } = createFakePayload(recent)
    const tool = createGetRecentFailuresTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler(
      { hours: 6 },
      makeContext(),
    )) as { failureCount: number; failures: Array<{ errorMessage?: string }> }
    expect(result.failureCount).toBe(1)
    expect(result.failures[0]?.errorMessage).toBe('boom')
  })

  it('honours mcpServer filter', async () => {
    const { payload, calls } = createFakePayload(seed)
    const tool = createGetRecentFailuresTool({ payload, collectionSlug: SLUG })
    await tool.handler(
      { hours: 24 * 365, mcpServer: 'integrations' },
      makeContext(),
    )
    const conditions = calls[0]?.where?.and ?? []
    const serverCondition = conditions.find((c) => 'mcpServer' in c)
    expect(serverCondition).toEqual({ mcpServer: { equals: 'integrations' } })
  })
})

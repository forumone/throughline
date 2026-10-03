import { describe, expect, it } from 'vitest'
import { formatAuditEvent, formatRelativeTime } from './index.js'

const NOW = Date.parse('2026-04-22T12:00:00.000Z')

describe('formatRelativeTime', () => {
  it('returns "just now" within a minute', () => {
    expect(formatRelativeTime('2026-04-22T11:59:30.000Z', NOW)).toBe('just now')
  })

  it('returns minutes for under an hour', () => {
    expect(formatRelativeTime('2026-04-22T11:30:00.000Z', NOW)).toBe('30 minutes ago')
    expect(formatRelativeTime('2026-04-22T11:59:00.000Z', NOW)).toBe('1 minute ago')
  })

  it('returns hours for under a day', () => {
    expect(formatRelativeTime('2026-04-22T10:00:00.000Z', NOW)).toBe('2 hours ago')
    expect(formatRelativeTime('2026-04-22T11:00:00.000Z', NOW)).toBe('1 hour ago')
  })

  it('returns days for under a week', () => {
    expect(formatRelativeTime('2026-04-20T12:00:00.000Z', NOW)).toBe('2 days ago')
    expect(formatRelativeTime('2026-04-21T12:00:00.000Z', NOW)).toBe('1 day ago')
  })

  it('returns YYYY-MM-DD for anything older than a week', () => {
    expect(formatRelativeTime('2026-04-10T12:00:00.000Z', NOW)).toBe('2026-04-10')
  })

  it('falls back to the original string for unparseable dates', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('not-a-date')
  })

  it('clamps negative diffs to "just now"', () => {
    expect(formatRelativeTime('2026-04-22T13:00:00.000Z', NOW)).toBe('just now')
  })
})

describe('formatAuditEvent', () => {
  it('extracts the user name when present', () => {
    const result = formatAuditEvent(
      {
        createdAt: '2026-04-22T11:00:00.000Z',
        actor: { type: 'user', userId: 'u1', userName: 'Ada' },
        summary: 'Published the homepage',
        action: 'publishing.publish',
        mcpServer: 'publishing',
        mcpTool: 'publish',
      },
      NOW,
    )
    expect(result.who).toBe('Ada')
    expect(result.when).toBe('1 hour ago')
    expect(result.what).toBe('Published the homepage')
    expect(result.action).toBe('publishing.publish')
  })

  it('falls back to apiKeyName, then "system", then "unknown"', () => {
    const a = formatAuditEvent({
      createdAt: '2026-04-22T11:00:00.000Z',
      actor: { type: 'integration', apiKeyName: 'ci-bot' },
      action: 'integration.synced',
      mcpServer: 'integrations',
      mcpTool: 'sync',
    }, NOW)
    expect(a.who).toBe('ci-bot')

    const b = formatAuditEvent({
      createdAt: '2026-04-22T11:00:00.000Z',
      actor: { type: 'system' },
      action: 'system.healthcheck',
      mcpServer: 'audit',
      mcpTool: 'heartbeat',
    }, NOW)
    expect(b.who).toBe('system')

    const c = formatAuditEvent({
      createdAt: '2026-04-22T11:00:00.000Z',
      actor: {},
      action: 'system.error',
      mcpServer: 'audit',
      mcpTool: 'heartbeat',
    }, NOW)
    expect(c.who).toBe('unknown')
  })

  it('treats success !== false as success', () => {
    expect(formatAuditEvent({ action: 'x', mcpServer: 'y', mcpTool: 'z', createdAt: '2026-04-22T11:00:00.000Z' }, NOW).success).toBe(true)
    expect(formatAuditEvent({ action: 'x', mcpServer: 'y', mcpTool: 'z', createdAt: '2026-04-22T11:00:00.000Z', success: false }, NOW).success).toBe(false)
  })

  it('passes through optional context fields when present', () => {
    const result = formatAuditEvent(
      {
        createdAt: '2026-04-22T11:00:00.000Z',
        actor: { type: 'user', userId: 'u1', userName: 'Ada' },
        summary: 'Updated headline',
        action: 'content.update',
        mcpServer: 'payload',
        mcpTool: 'update',
        prompt: 'Make the hero punchier',
        reasoning: 'Marketing requested it',
        changesSummary: 'Headline shortened by ten words',
        diff: { headline: { before: 'Old', after: 'New' } },
        targetCollection: 'pages',
        targetId: 'p1',
        targetTitle: 'Homepage',
      },
      NOW,
    )
    expect(result.prompt).toBe('Make the hero punchier')
    expect(result.why).toBe('Marketing requested it')
    expect(result.changesSummary).toBe('Headline shortened by ten words')
    expect(result.diff?.['headline']?.before).toBe('Old')
    expect(result.targetTitle).toBe('Homepage')
  })

  it('drops optional fields when they are not strings', () => {
    const result = formatAuditEvent(
      {
        createdAt: '2026-04-22T11:00:00.000Z',
        actor: { type: 'system' },
        summary: 'Heartbeat',
        action: 'system.healthcheck',
        mcpServer: 'audit',
        mcpTool: 'heartbeat',
        prompt: null,
        targetTitle: 42,
      },
      NOW,
    )
    expect(result.prompt).toBeUndefined()
    expect(result.targetTitle).toBeUndefined()
  })
})

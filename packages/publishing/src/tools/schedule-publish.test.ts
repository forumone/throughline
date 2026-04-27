import { describe, expect, it, vi } from 'vitest'
import { createSchedulePublishTool } from './schedule-publish.js'
import { attachComponentValidator, callTool, makeDeps } from './_test-helpers.js'

const passingDoc = {
  _status: 'draft',
  updatedAt: '2026-04-23T12:00:00.000Z',
  publishedAt: null,
  title: 'Hello',
  slug: 'hello',
  seo: { title: 'Hello', description: 'A test page description for SEO previews.' },
  layout: [{ blockType: 'hero' }],
}

const futureIso = new Date(Date.now() + 60 * 60_000).toISOString()
const pastIso = new Date(Date.now() - 60 * 60_000).toISOString()

describe('schedule_publish tool', () => {
  it('schedules when preflight passes', async () => {
    const deps = makeDeps({
      document: passingDoc,
      payloadFindByID: vi.fn(async () => passingDoc),
    })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))

    const result = (await callTool(createSchedulePublishTool(deps), {
      collection: 'pages',
      id: 'p1',
      publishAt: futureIso,
    })) as { scheduled: boolean }

    expect(result.scheduled).toBe(true)
    const updateArgs = deps.spies.payloadUpdate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>
    }
    expect(updateArgs.data['scheduledPublishAt']).toBe(futureIso)
    const eventArgs = deps.spies.inngestSend.mock.calls[0]?.[0] as { name: string }
    expect(eventArgs.name).toBe('content/page.scheduled')
    const auditArgs = deps.auditMock.mock.calls[0]?.[0] as { action: string; success: boolean }
    expect(auditArgs.action).toBe('publishing.schedule')
    expect(auditArgs.success).toBe(true)
  })

  it('rejects past scheduledFor without touching the document', async () => {
    const deps = makeDeps({ document: passingDoc })

    const result = (await callTool(createSchedulePublishTool(deps), {
      collection: 'pages',
      id: 'p1',
      publishAt: pastIso,
    })) as { scheduled: boolean; reason?: string }

    expect(result.scheduled).toBe(false)
    expect(result.reason).toMatch(/future/)
    expect(deps.spies.payloadUpdate).not.toHaveBeenCalled()
  })

  it('does not schedule when preflight fails', async () => {
    const badDoc = { ...passingDoc, seo: { description: 'no title' } }
    const deps = makeDeps({
      document: badDoc,
      payloadFindByID: vi.fn(async () => badDoc),
    })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))

    const result = (await callTool(createSchedulePublishTool(deps), {
      collection: 'pages',
      id: 'p1',
      publishAt: futureIso,
    })) as { scheduled: boolean; failedAt?: string }

    expect(result.scheduled).toBe(false)
    expect(result.failedAt).toBe('required-fields')
    expect(deps.spies.payloadUpdate).not.toHaveBeenCalled()
    const auditArgs = deps.auditMock.mock.calls[0]?.[0] as { success: boolean }
    expect(auditArgs.success).toBe(false)
  })
})

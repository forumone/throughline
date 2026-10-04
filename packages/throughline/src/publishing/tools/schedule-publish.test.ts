import { describe, expect, it, vi } from 'vitest'
import { createSchedulePublishTool } from './schedule-publish.js'
import { anonymousContext, attachComponentValidator, callTool, makeDeps } from './_test-helpers.js'
import { APPROVALS_RESOLVER_SYMBOL } from '../../approvals/symbol.js'

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
      draft?: boolean
    }
    expect(updateArgs.data).toEqual({ scheduledPublishAt: futureIso })
    // A draft write: it must land on the latest version, where the publish at
    // the scheduled time reads from, and must not touch the live document.
    expect(updateArgs.draft).toBe(true)
    // The collection's afterChange hook sends the wake-up, for every route a
    // schedule can be written by. Sending it here as well would be a second.
    expect(deps.spies.inngestSend).not.toHaveBeenCalled()
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

  it('stores the time in UTC whatever offset it arrived with', async () => {
    const deps = makeDeps({ document: passingDoc })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))
    const local = new Date(Date.now() + 2 * 60 * 60_000)
    // The same instant written with a -04:00 offset, as a browser in New York would.
    const shifted = new Date(local.getTime() - 4 * 60 * 60_000).toISOString().replace('Z', '-04:00')

    const result = (await callTool(createSchedulePublishTool(deps), {
      collection: 'pages',
      id: 'p1',
      publishAt: shifted,
    })) as { scheduled: boolean; scheduledFor: string }

    expect(result.scheduledFor).toBe(local.toISOString())
  })

  /*
  Schedule it, get it approved, it goes out on the day. Refusing to schedule
  until the approval is in would make the editor wait for the approver before
  they could pick a date — and the approval check runs again when it fires.
  */
  it('schedules a document still waiting on approval, and says so', async () => {
    const doc = { ...passingDoc, policy: { requiresApproval: true } }
    const deps = makeDeps({ document: doc })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))
    Object.defineProperty(deps.payload, APPROVALS_RESOLVER_SYMBOL, {
      value: { getActiveApproval: async () => null },
    })

    const result = (await callTool(createSchedulePublishTool(deps), {
      collection: 'pages',
      id: 'p1',
      publishAt: futureIso,
    })) as { scheduled: boolean; warnings?: string[] }

    expect(result.scheduled).toBe(true)
    expect(result.warnings?.[0]).toMatch(/approval/)
  })

  it('schedules after an embargo ends, and refuses to schedule inside one', async () => {
    const embargoEnds = new Date(Date.now() + 2 * 60 * 60_000).toISOString()
    const doc = { ...passingDoc, policy: { embargoedUntil: embargoEnds } }
    const after = makeDeps({ document: doc })
    attachComponentValidator(after.payload, async () => ({ valid: true, issues: [] }))
    const ok = (await callTool(createSchedulePublishTool(after), {
      collection: 'pages',
      id: 'p1',
      publishAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    })) as { scheduled: boolean }
    expect(ok.scheduled).toBe(true)

    const inside = makeDeps({ document: doc })
    attachComponentValidator(inside.payload, async () => ({ valid: true, issues: [] }))
    const refused = (await callTool(createSchedulePublishTool(inside), {
      collection: 'pages',
      id: 'p1',
      publishAt: futureIso, // one hour out, the embargo is two
    })) as { scheduled: boolean; failedAt?: string; reason?: string }
    expect(refused.scheduled).toBe(false)
    expect(refused.failedAt).toBe('embargo')
    expect(refused.reason).toMatch(/^The embargo lasts until .*, after the time you chose\.$/)
    expect(inside.spies.payloadUpdate).not.toHaveBeenCalled()
  })

  it('refuses a document that does not exist', async () => {
    const deps = makeDeps({ payloadFindByID: vi.fn(async () => null) })
    const result = (await callTool(createSchedulePublishTool(deps), {
      collection: 'pages',
      id: 'missing',
      publishAt: futureIso,
    })) as { scheduled: boolean; reason?: string }
    expect(result).toMatchObject({ scheduled: false, code: 'not-found' })
  })

  it('refuses a caller with no user, like every other publishing tool', async () => {
    const deps = makeDeps({ document: passingDoc })
    const result = (await callTool(
      createSchedulePublishTool(deps),
      { collection: 'pages', id: 'p1', publishAt: futureIso },
      anonymousContext,
    )) as Record<string, unknown>
    expect(result['scheduled']).toBeUndefined()
    expect(deps.spies.payloadUpdate).not.toHaveBeenCalled()
  })
})

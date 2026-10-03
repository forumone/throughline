import { describe, expect, it, vi } from 'vitest'
import { createUnpublishTool } from './unpublish.js'
import { callTool, makeDeps } from './_test-helpers.js'

describe('unpublish tool', () => {
  it('reverts a published document to draft and fires content/page.unpublished', async () => {
    const doc = { _status: 'published', title: 'Live page', slug: 'live' }
    const deps = makeDeps({
      document: doc,
      payloadFindByID: vi.fn(async () => doc),
    })

    const result = (await callTool(createUnpublishTool(deps), {
      collection: 'pages',
      id: 'p1',
    })) as { unpublished: boolean }

    expect(result.unpublished).toBe(true)
    const updateArgs = deps.spies.payloadUpdate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>
      context: Record<string, unknown>
    }
    expect(updateArgs.data['_status']).toBe('draft')
    expect(updateArgs.context['bypassPublishingServer']).toBe(true)
    const eventArgs = deps.spies.inngestSend.mock.calls[0]?.[0] as { name: string }
    expect(eventArgs.name).toBe('content/page.unpublished')
    const auditArgs = deps.auditMock.mock.calls[0]?.[0] as { action: string; success: boolean }
    expect(auditArgs.action).toBe('publishing.unpublish')
    expect(auditArgs.success).toBe(true)
  })

  it('returns a clear reason when the document is not published', async () => {
    const doc = { _status: 'draft' }
    const deps = makeDeps({
      document: doc,
      payloadFindByID: vi.fn(async () => doc),
    })

    const result = (await callTool(createUnpublishTool(deps), {
      collection: 'pages',
      id: 'p1',
    })) as { unpublished: boolean; reason?: string }

    expect(result.unpublished).toBe(false)
    expect(result.reason).toMatch(/not currently published/)
    expect(deps.spies.payloadUpdate).not.toHaveBeenCalled()
    expect(deps.spies.inngestSend).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createPublishTool } from './publish.js'
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

describe('publish tool', () => {
  it('returns published: true and writes a publishing.publish audit on success', async () => {
    const deps = makeDeps({
      document: passingDoc,
      payloadFindByID: vi.fn(async () => passingDoc),
    })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))

    const result = (await callTool(createPublishTool(deps), {
      collection: 'pages',
      id: 'p1',
    })) as { published: boolean }

    expect(result.published).toBe(true)
    expect(deps.spies.payloadUpdate).toHaveBeenCalled()
    expect(deps.spies.inngestSend).toHaveBeenCalled()
    expect(deps.auditMock).toHaveBeenCalledTimes(1)
    const auditArgs = deps.auditMock.mock.calls[0]?.[0] as { action: string; success: boolean }
    expect(auditArgs.action).toBe('publishing.publish')
    expect(auditArgs.success).toBe(true)
  })

  it('returns failure with the failing step and writes a failed audit', async () => {
    const badDoc = { ...passingDoc, seo: { description: 'no title' } }
    const deps = makeDeps({
      document: badDoc,
      payloadFindByID: vi.fn(async () => badDoc),
    })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))

    const result = (await callTool(createPublishTool(deps), {
      collection: 'pages',
      id: 'p1',
    })) as { published: boolean; failedAt?: string }

    expect(result.published).toBe(false)
    expect(result.failedAt).toBe('required-fields')
    const auditArgs = deps.auditMock.mock.calls[0]?.[0] as { action: string; success: boolean }
    expect(auditArgs.action).toBe('publishing.publish')
    expect(auditArgs.success).toBe(false)
  })

  it('forwards _meta into the audit record', async () => {
    const deps = makeDeps({
      document: passingDoc,
      payloadFindByID: vi.fn(async () => passingDoc),
    })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))

    await callTool(createPublishTool(deps), {
      collection: 'pages',
      id: 'p1',
      _meta: { userPrompt: 'Ship it', reasoning: 'Marketing approved' },
    })

    const auditArgs = deps.auditMock.mock.calls[0]?.[0] as { prompt?: string; reasoning?: string }
    expect(auditArgs.prompt).toBe('Ship it')
    expect(auditArgs.reasoning).toBe('Marketing approved')
  })
})

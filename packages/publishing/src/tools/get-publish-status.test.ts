import { describe, expect, it, vi } from 'vitest'
import { createGetPublishStatusTool } from './get-publish-status.js'
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

describe('get_publish_status tool', () => {
  it('reports canPublish=true when preflight succeeds and writes no audit', async () => {
    const deps = makeDeps({
      document: passingDoc,
      payloadFindByID: vi.fn(async () => passingDoc),
    })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))

    const result = (await callTool(createGetPublishStatusTool(deps), {
      collection: 'pages',
      id: 'p1',
    })) as { wouldPublish: { canPublish: boolean } }

    expect(result.wouldPublish.canPublish).toBe(true)
    expect(deps.auditMock).not.toHaveBeenCalled()
    expect(deps.spies.payloadUpdate).not.toHaveBeenCalled()
    expect(deps.spies.inngestSend).not.toHaveBeenCalled()
  })

  it('reports canPublish=false with the failing step on preflight failure', async () => {
    const badDoc = { ...passingDoc, seo: { description: 'no title' } }
    const deps = makeDeps({
      document: badDoc,
      payloadFindByID: vi.fn(async () => badDoc),
    })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))

    const result = (await callTool(createGetPublishStatusTool(deps), {
      collection: 'pages',
      id: 'p1',
    })) as {
      wouldPublish: { canPublish: boolean; blockedAt?: string }
    }

    expect(result.wouldPublish.canPublish).toBe(false)
    expect(result.wouldPublish.blockedAt).toBe('required-fields')
  })

  it('flags hasUnpublishedChanges when updatedAt is newer than publishedAt', async () => {
    const doc = {
      ...passingDoc,
      _status: 'published',
      updatedAt: '2026-04-23T12:00:00.000Z',
      publishedAt: '2026-04-22T12:00:00.000Z',
    }
    const deps = makeDeps({
      document: doc,
      payloadFindByID: vi.fn(async () => doc),
    })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))

    const result = (await callTool(createGetPublishStatusTool(deps), {
      collection: 'pages',
      id: 'p1',
    })) as { hasUnpublishedChanges: boolean; lastPublished: string | null }

    expect(result.hasUnpublishedChanges).toBe(true)
    expect(result.lastPublished).toBe('2026-04-22T12:00:00.000Z')
  })
})

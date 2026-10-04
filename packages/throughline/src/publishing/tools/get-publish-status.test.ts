import { describe, expect, it, vi } from 'vitest'
import { createGetPublishStatusTool } from './get-publish-status.js'
import { attachComponentValidator, callTool, makeDeps } from './_test-helpers.js'

vi.mock('payload', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  createLocalReq: async ({ user }: { user?: unknown }) => ({ user }),
}))

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

  it('flags hasUnpublishedChanges when the newer draft differs from what is live', async () => {
    const doc = {
      ...passingDoc,
      _status: 'draft',
      updatedAt: '2026-04-23T12:00:00.000Z',
      publishedAt: '2026-04-22T12:00:00.000Z',
    }
    const live = { ...doc, _status: 'published', title: 'What is live' }
    const deps = makeDeps({
      document: doc,
      payloadFindByID: vi.fn(async ({ draft }: { draft?: boolean }) => (draft === false ? live : doc)),
    })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))

    const result = (await callTool(createGetPublishStatusTool(deps), {
      collection: 'pages',
      id: 'p1',
    })) as { hasUnpublishedChanges: boolean; lastPublished: string | null }

    expect(result.hasUnpublishedChanges).toBe(true)
    expect(result.lastPublished).toBe('2026-04-22T12:00:00.000Z')
  })

  it('does not, when the newer draft is the same as what is live (after a rollback, say)', async () => {
    const doc = {
      ...passingDoc,
      _status: 'draft',
      updatedAt: '2026-04-23T12:00:00.000Z',
      publishedAt: '2026-04-22T12:00:00.000Z',
    }
    const live = { ...doc, _status: 'published', updatedAt: '2026-04-22T12:00:00.000Z' }
    const deps = makeDeps({
      document: doc,
      payloadFindByID: vi.fn(async ({ draft }: { draft?: boolean }) => (draft === false ? live : doc)),
    })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))

    const result = (await callTool(createGetPublishStatusTool(deps), {
      collection: 'pages',
      id: 'p1',
    })) as { hasUnpublishedChanges: boolean }

    expect(result.hasUnpublishedChanges).toBe(false)
  })

  it('lists every blocker at once, the first also in the fields it always used', async () => {
    const badDoc = { ...passingDoc, seo: { description: 'no title' } }
    const deps = makeDeps({
      document: badDoc,
      payloadFindByID: vi.fn(async () => badDoc),
    })
    attachComponentValidator(deps.payload, async () => ({
      valid: false,
      issues: [{ severity: 'error', rule: 'max-per-page', message: 'Too many heroes', blockIndex: 1 }],
    }))

    const result = (await callTool(createGetPublishStatusTool(deps), {
      collection: 'pages',
      id: 'p1',
    })) as {
      wouldPublish: { blockedAt?: string; blockers?: { blockedAt?: string; issues: unknown[] }[] }
    }

    expect(result.wouldPublish.blockedAt).toBe('composition')
    expect(result.wouldPublish.blockers?.map((b) => b.blockedAt)).toEqual([
      'composition',
      'required-fields',
    ])
    expect(result.wouldPublish.blockers?.[0]?.issues).toHaveLength(1)
  })

  it("returns the collection's preview link, absolute, and null where there is none", async () => {
    const deps = makeDeps({
      document: passingDoc,
      payloadFindByID: vi.fn(async () => passingDoc),
    })
    attachComponentValidator(deps.payload, async () => ({ valid: true, issues: [] }))
    const call = async () =>
      (await callTool(createGetPublishStatusTool(deps), { collection: 'pages', id: 'p1' })) as {
        previewUrl: string | null
      }

    expect((await call()).previewUrl).toBeNull()

    const payload = deps.payload as unknown as Record<string, unknown>
    payload['collections'] = {
      pages: {
        config: { admin: { preview: (doc: { slug: string }) => `/next/preview?slug=${doc.slug}` } },
      },
    }
    payload['config'] = { ...(payload['config'] as object), serverURL: 'https://example.test' }

    expect((await call()).previewUrl).toBe('https://example.test/next/preview?slug=hello')
  })
})

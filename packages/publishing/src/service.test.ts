import { describe, expect, it, vi } from 'vitest'
import type { Payload, TypedUser } from 'payload'
import {
  attachPublishingService,
  createPublishingService,
  getPublishingService,
  publishDocument,
  toAuthenticatedUser,
  unpublishDocument,
} from './service.js'
import { makeDeps } from './tools/_test-helpers.js'

const editor = {
  id: 'u-42',
  email: 'editor@example.com',
  name: 'Ed Editor',
  roles: ['editor'],
  collection: 'users',
} as unknown as TypedUser

/** A document that clears every preflight step. */
const publishableDoc = {
  id: '1',
  title: 'About us',
  slug: 'about-us',
  _status: 'draft',
  layout: [],
  seo: { title: 'About us', description: 'Who we are and what we do.' },
  policy: { requiresApproval: false },
}

describe('createPublishingService', () => {
  it('publishes a document and reports the timestamp', async () => {
    const deps = makeDeps({ document: publishableDoc })
    const service = createPublishingService(deps)

    const result = await service.publish({
      collection: 'pages',
      id: '1',
      actor: { user: null, apiKeyName: 'seed-key', channel: 'mcp' },
    })

    expect(result.published).toBe(true)
    expect(result.publishedAt).toEqual(expect.any(String))
    expect(deps.spies.payloadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ _status: 'published' }),
        context: { bypassPublishingServer: true },
      }),
    )
  })

  it('returns the failing step, reason and suggestion when the pipeline blocks', async () => {
    const deps = makeDeps({
      document: { ...publishableDoc, seo: { title: '', description: '' } },
    })
    const service = createPublishingService(deps)

    const result = await service.publish({
      collection: 'pages',
      id: '1',
      actor: { user: null, apiKeyName: 'k', channel: 'mcp' },
    })

    expect(result.published).toBe(false)
    expect(result.failedAt).toBe('required-fields')
    expect(result.reason).toEqual(expect.any(String))
    // No write when a step says no.
    expect(deps.spies.payloadUpdate).not.toHaveBeenCalled()
  })

  // The defect this release exists to fix: an admin publish must be
  // attributed to the person, not to whatever key transported it.
  it('records the human user as the audit actor', async () => {
    const deps = makeDeps({ document: publishableDoc })
    const service = createPublishingService(deps)

    await service.publish({
      collection: 'pages',
      id: '1',
      actor: {
        user: toAuthenticatedUser(editor),
        enforceAccessAs: editor,
        channel: 'admin',
      },
    })

    expect(deps.auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          type: 'user',
          userId: 'u-42',
          userName: 'Ed Editor',
        }),
        action: 'publishing.publish',
        mcpTool: 'admin:publish',
      }),
    )
  })

  it('records a system actor when no user is present', async () => {
    const deps = makeDeps({ document: publishableDoc })
    const service = createPublishingService(deps)

    await service.publish({
      collection: 'pages',
      id: '1',
      actor: { user: null, apiKeyName: 'ci-key', channel: 'mcp' },
    })

    expect(deps.auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ type: 'system', apiKeyName: 'ci-key' }),
        mcpTool: 'publish',
      }),
    )
  })

  // Bypassing the status hook must not bypass access control.
  it('runs reads and writes with overrideAccess:false when enforcing access', async () => {
    const deps = makeDeps({ document: publishableDoc })
    const service = createPublishingService(deps)

    await service.publish({
      collection: 'pages',
      id: '1',
      actor: { user: toAuthenticatedUser(editor), enforceAccessAs: editor, channel: 'admin' },
    })

    expect(deps.spies.payloadFindByID).toHaveBeenCalledWith(
      expect.objectContaining({ user: editor, overrideAccess: false }),
    )
    expect(deps.spies.payloadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ user: editor, overrideAccess: false }),
    )
  })

  it('leaves overrideAccess alone for the MCP path', async () => {
    const deps = makeDeps({ document: publishableDoc })
    const service = createPublishingService(deps)

    await service.publish({
      collection: 'pages',
      id: '1',
      actor: { user: null, apiKeyName: 'k', channel: 'mcp' },
    })

    const updateArgs = deps.spies.payloadUpdate.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updateArgs).not.toHaveProperty('overrideAccess')
    expect(updateArgs).not.toHaveProperty('user')
  })

  // Reported against 0.3.0: with no valid INNGEST_EVENT_KEY the publish
  // returned 500 on a document that was published, and the audit event was
  // never written.
  it('reports a publish as successful when only the event emission fails', async () => {
    const deps = makeDeps({
      document: publishableDoc,
      inngestSend: vi.fn(async () => {
        throw new Error('Inngest API Error: 401 Event key not found')
      }),
    })
    const service = createPublishingService(deps)

    const result = await service.publish({
      collection: 'pages',
      id: '1',
      actor: { user: toAuthenticatedUser(editor), enforceAccessAs: editor, channel: 'admin' },
    })

    expect(result.published).toBe(true)
    expect(result.publishedAt).toEqual(expect.any(String))
    expect(result.warnings?.[0]).toContain('content/page.published')
    // The write happened, and the audit trail records it.
    expect(deps.spies.payloadUpdate).toHaveBeenCalledTimes(1)
    expect(deps.auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'publishing.publish', success: true }),
    )
  })

  it('logs the warning rather than staying silent about it', async () => {
    const warn = vi.fn()
    const deps = makeDeps({
      document: publishableDoc,
      inngestSend: vi.fn(async () => {
        throw new Error('Event key not found')
      }),
    })
    const service = createPublishingService({
      ...deps,
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
    })

    await service.publish({
      collection: 'pages',
      id: '1',
      actor: { user: null, apiKeyName: 'k', channel: 'mcp' },
    })

    expect(warn).toHaveBeenCalledWith(
      'Publish completed with warnings',
      expect.objectContaining({ warnings: [expect.stringContaining('Event key not found')] }),
    )
  })

  it('reports an unpublish as successful when only the event emission fails', async () => {
    const deps = makeDeps({
      document: { ...publishableDoc, _status: 'published' },
      inngestSend: vi.fn(async () => {
        throw new Error('Inngest API Error: 401 Event key not found')
      }),
    })
    const service = createPublishingService(deps)

    const result = await service.unpublish({
      collection: 'pages',
      id: '1',
      actor: { user: toAuthenticatedUser(editor), enforceAccessAs: editor, channel: 'admin' },
    })

    expect(result.unpublished).toBe(true)
    expect(result.warnings?.[0]).toContain('content/page.unpublished')
    expect(deps.auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'publishing.unpublish', success: true }),
    )
  })

  it('carries no warnings on a clean publish', async () => {
    const deps = makeDeps({ document: publishableDoc })
    const service = createPublishingService(deps)

    const result = await service.publish({
      collection: 'pages',
      id: '1',
      actor: { user: null, apiKeyName: 'k', channel: 'mcp' },
    })

    expect(result.warnings).toBeUndefined()
  })

  it('unpublishes a published document and fires the event', async () => {
    const deps = makeDeps({ document: { ...publishableDoc, _status: 'published' } })
    const service = createPublishingService(deps)

    const result = await service.unpublish({
      collection: 'pages',
      id: '1',
      actor: { user: toAuthenticatedUser(editor), enforceAccessAs: editor, channel: 'admin' },
    })

    expect(result).toEqual({ unpublished: true })
    expect(deps.spies.inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'content/page.unpublished' }),
    )
    expect(deps.auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ mcpTool: 'admin:unpublish' }),
    )
  })

  /*
  Taking a live page down while somebody has it open in the admin should be a
  refusal, not a surprise. The Local API overrides locks by default, so this has
  to be asked for.
  */
  it('asks Payload to respect a lock when unpublishing', async () => {
    const deps = makeDeps({ document: { ...publishableDoc, _status: 'published' } })
    const service = createPublishingService(deps)

    await service.unpublish({
      collection: 'pages',
      id: '1',
      actor: { user: null, apiKeyName: 'k', channel: 'mcp' },
    })

    expect(deps.spies.payloadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ overrideLock: false }),
    )
  })

  it('refuses to unpublish a document that is not published', async () => {
    const deps = makeDeps({ document: publishableDoc })
    const service = createPublishingService(deps)

    const result = await service.unpublish({
      collection: 'pages',
      id: '1',
      actor: { user: null, apiKeyName: 'k', channel: 'mcp' },
    })

    expect(result.unpublished).toBe(false)
    expect(deps.spies.payloadUpdate).not.toHaveBeenCalled()
  })

  it('reports publishability without writing anything', async () => {
    const deps = makeDeps({ document: publishableDoc })
    const service = createPublishingService(deps)

    const status = await service.getStatus({
      collection: 'pages',
      id: '1',
      actor: { user: null, apiKeyName: 'k', channel: 'mcp' },
    })

    expect(status).toMatchObject({ status: 'draft', publishable: true, publishedAt: null })
    expect(deps.spies.payloadUpdate).not.toHaveBeenCalled()
    expect(deps.auditMock).not.toHaveBeenCalled()
  })
})

describe('getPublishingService', () => {
  it('throws a message that names the fix when the plugin is not installed', () => {
    expect(() => getPublishingService({})).toThrow(/publishingPlugin/)
  })

  it('round-trips through attach', () => {
    const deps = makeDeps()
    const service = createPublishingService(deps)
    const payload = {}
    attachPublishingService(payload, service)
    expect(getPublishingService(payload)).toBe(service)
  })
})

describe('publishDocument / unpublishDocument', () => {
  it('publishes as the given user with that user enforced and attributed', async () => {
    const deps = makeDeps({ document: publishableDoc })
    const service = createPublishingService(deps)
    const publishSpy = vi.spyOn(service, 'publish')
    attachPublishingService(deps.payload as object, service)

    await publishDocument({
      payload: deps.payload as Payload,
      collection: 'pages',
      id: '1',
      user: editor,
    })

    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        id: '1',
        actor: expect.objectContaining({
          enforceAccessAs: editor,
          channel: 'admin',
          user: expect.objectContaining({ id: 'u-42' }),
        }),
      }),
    )
  })

  it('unpublishes as the given user', async () => {
    const deps = makeDeps({ document: { ...publishableDoc, _status: 'published' } })
    const service = createPublishingService(deps)
    attachPublishingService(deps.payload as object, service)

    const result = await unpublishDocument({
      payload: deps.payload as Payload,
      collection: 'pages',
      id: '1',
      user: editor,
    })

    expect(result).toEqual({ unpublished: true })
  })
})

describe('toAuthenticatedUser', () => {
  it('returns null for no user', () => {
    expect(toAuthenticatedUser(null)).toBeNull()
  })

  it('falls back to email then id when name is missing', () => {
    const user = { id: 7, email: 'no-name@example.com' } as unknown as TypedUser
    expect(toAuthenticatedUser(user)).toEqual({
      id: '7',
      email: 'no-name@example.com',
      name: 'no-name@example.com',
      roles: [],
      groups: [],
    })
  })
})

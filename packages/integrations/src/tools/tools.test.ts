import { describe, expect, it } from 'vitest'
import { IntegrationRegistry } from '../registry.js'
import { webhookIntegration } from '../integrations/index.js'
import { createListIntegrationsTool } from './list-integrations.js'
import { createGetIntegrationStatusTool } from './get-integration-status.js'
import { createTriggerSyncTool } from './trigger-sync.js'
import { createTestIntegrationTool } from './test-integration.js'
import { createListIntegrationTypesTool } from './list-integration-types.js'
import {
  createFakeInngest,
  createFakePayload,
  makeContext,
  type FakeInstance,
} from './_test-helpers.js'

const SLUG = 'integrations'
const validSecret = 'a'.repeat(32)

const seed: FakeInstance[] = [
  {
    id: 'inst-1',
    name: 'Slack notifications',
    integrationType: 'webhook',
    enabled: true,
    config: { targetUrl: 'https://hooks.slack.com/x', signingSecret: validSecret },
    lastSyncAt: '2026-04-22T10:00:00.000Z',
    lastSyncStatus: 'success',
  },
  {
    id: 'inst-2',
    name: 'Disabled relay',
    integrationType: 'webhook',
    enabled: false,
    config: { targetUrl: 'https://relay.example.com', signingSecret: validSecret },
    lastSyncStatus: 'never-run',
  },
]

describe('createListIntegrationsTool', () => {
  it('denies non-readers', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createListIntegrationsTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler({}, makeContext({
      user: { id: 'u', email: 'e', name: 'n', roles: ['author'], groups: [] },
    }))) as { error?: string }
    expect(result.error).toMatch(/admins and editors/)
  })

  it('returns all enabled+disabled instances by default', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createListIntegrationsTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler({}, makeContext())) as {
      total: number
      integrations: Array<{ id: string; enabled: boolean; lastSyncStatus: string }>
    }
    expect(result.total).toBe(2)
    expect(result.integrations.map((i) => i.id)).toEqual(['inst-1', 'inst-2'])
  })

  it('filters to enabled only', async () => {
    const { payload, finds } = createFakePayload(seed)
    const tool = createListIntegrationsTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler({ onlyEnabled: true }, makeContext())) as {
      integrations: Array<{ id: string }>
    }
    expect(result.integrations).toEqual([
      expect.objectContaining({ id: 'inst-1' }),
    ])
    expect(finds[0]?.where?.and).toContainEqual({ enabled: { equals: true } })
  })
})

describe('createGetIntegrationStatusTool', () => {
  it('returns the matching instance', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createGetIntegrationStatusTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler({ integrationId: 'inst-1' }, makeContext())) as {
      id: string
      lastSyncStatus: string
    }
    expect(result.id).toBe('inst-1')
    expect(result.lastSyncStatus).toBe('success')
  })

  it('returns an error envelope on missing id', async () => {
    const { payload } = createFakePayload(seed)
    const tool = createGetIntegrationStatusTool({ payload, collectionSlug: SLUG })
    const result = (await tool.handler({ integrationId: 'missing' }, makeContext())) as {
      error?: string
    }
    expect(result.error).toMatch(/No integration instance/)
  })
})

describe('createTriggerSyncTool', () => {
  it('denies non-admins', async () => {
    const { payload } = createFakePayload(seed)
    const { inngest } = createFakeInngest()
    const tool = createTriggerSyncTool({ payload, collectionSlug: SLUG, inngest })
    const result = (await tool.handler(
      { integrationId: 'inst-1' },
      makeContext({
        user: { id: 'u', email: 'e', name: 'n', roles: ['editor'], groups: [] },
      }),
    )) as { error?: string }
    expect(result.error).toMatch(/Only admins/)
  })

  it('refuses to trigger a disabled instance', async () => {
    const { payload } = createFakePayload(seed)
    const { inngest, sends } = createFakeInngest()
    const tool = createTriggerSyncTool({ payload, collectionSlug: SLUG, inngest })
    const result = (await tool.handler({ integrationId: 'inst-2' }, makeContext())) as {
      error?: string
    }
    expect(result.error).toMatch(/disabled/)
    expect(sends).toHaveLength(0)
  })

  it('fires integration/manual-sync with the right shape for an enabled instance', async () => {
    const { payload } = createFakePayload(seed)
    const { inngest, sends } = createFakeInngest()
    const tool = createTriggerSyncTool({ payload, collectionSlug: SLUG, inngest })
    const result = (await tool.handler(
      { integrationId: 'inst-1', reason: 'verifying after change' },
      makeContext(),
    )) as { ok?: true; triggered?: { instanceId: string } }
    expect(result.ok).toBe(true)
    expect(sends).toHaveLength(1)
    expect(sends[0]?.name).toBe('integration/manual-sync')
    expect(sends[0]?.data).toMatchObject({
      integrationId: 'webhook',
      instanceId: 'inst-1',
      reason: 'verifying after change',
    })
  })

  // Used to escape as an unhandled rejection and reach the client as a generic
  // tool failure, with nothing to say the sync had never been queued.
  it('reports an unreachable Inngest as an error envelope', async () => {
    const { payload } = createFakePayload(seed)
    const { inngest } = createFakeInngest(new Error('ECONNREFUSED'))
    const tool = createTriggerSyncTool({ payload, collectionSlug: SLUG, inngest })
    const result = (await tool.handler({ integrationId: 'inst-1' }, makeContext())) as {
      error?: string
    }
    expect(result.error).toMatch(/Could not reach Inngest/)
  })
})

describe('createTestIntegrationTool', () => {
  it('returns the integration\'s healthcheck result', async () => {
    const registry = new IntegrationRegistry()
    registry.register({
      ...webhookIntegration,
      healthcheck: async () => ({ ok: true, details: 'fine' }),
    })
    const { payload } = createFakePayload(seed)
    const tool = createTestIntegrationTool({ payload, collectionSlug: SLUG, registry })
    const result = (await tool.handler({ integrationId: 'inst-1' }, makeContext())) as {
      healthy: boolean
      details: string | null
    }
    expect(result.healthy).toBe(true)
    expect(result.details).toBe('fine')
  })

  it('reports when the integration has no healthcheck', async () => {
    const registry = new IntegrationRegistry()
    const { healthcheck: _omit, ...rest } = webhookIntegration
    registry.register({ ...rest })
    const { payload } = createFakePayload(seed)
    const tool = createTestIntegrationTool({ payload, collectionSlug: SLUG, registry })
    const result = (await tool.handler({ integrationId: 'inst-1' }, makeContext())) as {
      ok: null | true
      message?: string
    }
    expect(result.ok).toBe(null)
    expect(result.message).toMatch(/does not implement a healthcheck/)
  })
})

describe('createListIntegrationTypesTool', () => {
  it('returns the registered integration metadata', async () => {
    const registry = new IntegrationRegistry()
    registry.register(webhookIntegration)
    const tool = createListIntegrationTypesTool({ registry })
    const result = (await tool.handler({}, makeContext())) as {
      types: Array<{ id: string; subscribesTo: string[]; hasHealthcheck: boolean }>
    }
    expect(result.types[0]?.id).toBe('webhook')
    expect(result.types[0]?.hasHealthcheck).toBe(true)
    expect(result.types[0]?.subscribesTo.length).toBeGreaterThan(0)
  })
})

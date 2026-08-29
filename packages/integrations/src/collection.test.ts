import { describe, expect, it } from 'vitest'
import { createIntegrationsCollection } from './collection.js'
import { IntegrationRegistry } from './registry.js'
import type { Integration } from './types.js'

function fakeIntegration(overrides: Partial<Integration> = {}): Integration {
  return {
    id: 'fake',
    name: 'Fake',
    description: 'Fake integration',
    category: 'webhook',
    configFields: [{ name: 'targetUrl', type: 'text' }],
    validateConfig: async (config) => {
      const c = config as { targetUrl?: string }
      if (!c.targetUrl) return { ok: false, reason: 'targetUrl is required' }
      return { ok: true }
    },
    subscribes: [],
    createFunctions: () => [],
    ...overrides,
  }
}

interface BeforeChangeArgs {
  data: Record<string, unknown>
  operation: 'create' | 'update' | 'delete' | 'read'
}

type BeforeChangeHook = (args: BeforeChangeArgs) => Promise<Record<string, unknown> | void>

describe('createIntegrationsCollection', () => {
  it('uses the default slug and exposes integration types as select options', () => {
    const registry = new IntegrationRegistry()
    registry.register(fakeIntegration({ id: 'webhook', name: 'Generic Webhook' }))
    const collection = createIntegrationsCollection({ registry })
    expect(collection.slug).toBe('integrations')
    const typeField = collection.fields.find(
      (f): f is Extract<typeof f, { name: string; type: 'select' }> =>
        'name' in f && f.name === 'integrationType' && f.type === 'select',
    )
    expect(typeField?.options).toEqual([{ label: 'Generic Webhook', value: 'webhook' }])
  })

  it('locks down create/update/delete to admins; read to admin/editor', () => {
    const registry = new IntegrationRegistry()
    registry.register(fakeIntegration())
    const collection = createIntegrationsCollection({ registry })
    const fakeReq = (roles: string[]) =>
      ({ req: { user: { roles } } }) as unknown as Parameters<NonNullable<typeof collection.access>['read']>[0]

    const access = collection.access!
    expect(access.read?.(fakeReq(['editor']))).toBe(true)
    expect(access.read?.(fakeReq(['viewer']))).toBe(false)
    expect(access.create?.(fakeReq(['editor']))).toBe(false)
    expect(access.create?.(fakeReq(['admin']))).toBe(true)
    expect(access.update?.(fakeReq(['admin']))).toBe(true)
    expect(access.delete?.(fakeReq(['editor']))).toBe(false)
  })

  it('beforeChange runs validateConfig and surfaces failures', async () => {
    const registry = new IntegrationRegistry()
    registry.register(fakeIntegration({ id: 'webhook' }))
    const collection = createIntegrationsCollection({ registry })

    const hook = collection.hooks!.beforeChange![0] as unknown as BeforeChangeHook
    await expect(
      hook({ data: { integrationType: 'webhook', config: {} }, operation: 'create' }),
    ).rejects.toThrow(/Invalid config.*targetUrl is required/)

    const ok = await hook({
      data: { integrationType: 'webhook', config: { targetUrl: 'https://x' } },
      operation: 'create',
    })
    expect(ok).toEqual({
      integrationType: 'webhook',
      config: { targetUrl: 'https://x' },
    })
  })

  it('beforeChange rejects unknown integration types', async () => {
    const registry = new IntegrationRegistry()
    registry.register(fakeIntegration({ id: 'webhook' }))
    const collection = createIntegrationsCollection({ registry })
    const hook = collection.hooks!.beforeChange![0] as unknown as BeforeChangeHook

    await expect(
      hook({ data: { integrationType: 'salesforce', config: {} }, operation: 'create' }),
    ).rejects.toThrow(/Unknown integration type "salesforce"/)
  })

  it('beforeChange is a no-op for non-write operations', async () => {
    const registry = new IntegrationRegistry()
    registry.register(fakeIntegration({ id: 'webhook' }))
    const collection = createIntegrationsCollection({ registry })
    const hook = collection.hooks!.beforeChange![0] as unknown as BeforeChangeHook

    const data = { integrationType: 'webhook', config: { invalid: true } }
    const result = await hook({ data, operation: 'read' as 'create' })
    expect(result).toBe(data)
  })
})

describe('the manual-sync control', () => {
  function collectionWith(slug?: string) {
    const registry = new IntegrationRegistry()
    registry.register(fakeIntegration())
    return createIntegrationsCollection({
      ...(slug ? { slug } : {}),
      registry,
      endpoints: [{ path: '/:id/sync', method: 'post', handler: () => new Response(null) }],
    })
  }

  it('mounts the endpoints it was given', () => {
    const endpoints = collectionWith().endpoints
    expect(Array.isArray(endpoints) && endpoints.map((e) => `${e.method} ${e.path}`)).toEqual([
      'post /:id/sync',
    ])
  })

  it('is a ui field, so it adds no column and nothing to save', () => {
    const field = collectionWith().fields.find((f) => 'name' in f && f.name === 'triggerSync')
    expect(field?.type).toBe('ui')
  })

  // Beside the three status fields it moves, which is where an operator
  // waiting for a sync is already looking.
  it('sits in the sidebar, above lastSyncAt', () => {
    const fields = collectionWith().fields
    const names = fields.filter((f) => 'name' in f).map((f) => (f as { name: string }).name)
    expect(names.indexOf('triggerSync')).toBeLessThan(names.indexOf('lastSyncAt'))
    const field = fields.find((f) => 'name' in f && f.name === 'triggerSync')
    expect(field?.admin?.position).toBe('sidebar')
  })

  // The component POSTs to `<slug>/:id/sync`, so it has to be told the slug a
  // host may have overridden.
  it('passes the collection slug through to the client component', () => {
    const field = collectionWith('connections').fields.find(
      (f) => 'name' in f && f.name === 'triggerSync',
    )
    const component = (field?.admin as { components?: { Field?: unknown } } | undefined)?.components
      ?.Field
    expect(component).toMatchObject({
      path: '@forumone/throughline-integrations/client',
      exportName: 'SyncButton',
      clientProps: { collectionSlug: 'connections' },
    })
  })
})

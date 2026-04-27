import { describe, expect, it } from 'vitest'
import { IntegrationRegistry } from './registry.js'
import type { Integration } from './types.js'

function fakeIntegration(id: string): Integration {
  return {
    id,
    name: `Fake ${id}`,
    description: `Fake integration ${id}`,
    category: 'webhook',
    configFields: [],
    validateConfig: async () => ({ ok: true }),
    subscribes: [],
    createFunctions: () => [],
  }
}

describe('IntegrationRegistry', () => {
  it('registers and retrieves integrations', () => {
    const registry = new IntegrationRegistry()
    const a = fakeIntegration('alpha')
    registry.register(a)
    expect(registry.get('alpha')).toBe(a)
    expect(registry.has('alpha')).toBe(true)
    expect(registry.size).toBe(1)
  })

  it('lists all registered integrations in registration order', () => {
    const registry = new IntegrationRegistry()
    registry.register(fakeIntegration('alpha'))
    registry.register(fakeIntegration('beta'))
    expect(registry.list().map((i) => i.id)).toEqual(['alpha', 'beta'])
  })

  it('throws on duplicate id', () => {
    const registry = new IntegrationRegistry()
    registry.register(fakeIntegration('alpha'))
    expect(() => registry.register(fakeIntegration('alpha'))).toThrow(/already registered/)
  })

  it('returns undefined for unknown ids', () => {
    const registry = new IntegrationRegistry()
    expect(registry.get('missing')).toBeUndefined()
    expect(registry.has('missing')).toBe(false)
  })
})

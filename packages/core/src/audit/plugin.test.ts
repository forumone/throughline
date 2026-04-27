import { describe, expect, it, vi } from 'vitest'
import type { Config, Payload } from 'payload'
import { auditPlugin, getAuditWriter } from './plugin.js'
import { DEFAULT_AUDIT_SLUG } from './collection.js'

function fakeIncomingConfig(overrides: Partial<Config> = {}): Config {
  return {
    db: {} as unknown as Config['db'],
    secret: 'x'.repeat(32),
    collections: [],
    ...overrides,
  } as Config
}

function fakePayload(): Payload {
  return {
    create: vi.fn(async () => ({ id: 'evt_1' })),
  } as unknown as Payload
}

describe('auditPlugin', () => {
  it('appends the audit collection by default', async () => {
    const incoming = fakeIncomingConfig({
      collections: [{ slug: 'pages', fields: [] } as unknown as Config['collections'][number]],
    })
    const result = auditPlugin({})(incoming)
    const final = await Promise.resolve(result)
    const slugs = (final.collections ?? []).map((c) => c.slug)
    expect(slugs).toContain('pages')
    expect(slugs).toContain(DEFAULT_AUDIT_SLUG)
  })

  it('returns the incoming config unchanged when enabled is false', async () => {
    const incoming = fakeIncomingConfig()
    const result = auditPlugin({ enabled: false })(incoming)
    const final = await Promise.resolve(result)
    expect(final).toBe(incoming)
  })

  it('attaches the writer to payload via onInit and getAuditWriter retrieves it', async () => {
    const incoming = fakeIncomingConfig()
    const result = auditPlugin({})(incoming)
    const final = (await Promise.resolve(result)) as Config

    const payload = fakePayload()
    await final.onInit?.(payload)

    const writer = getAuditWriter(payload as unknown as object)
    expect(typeof writer).toBe('function')

    await writer({
      actor: { type: 'system' },
      action: 'system.healthcheck',
      mcpServer: 'audit',
      mcpTool: 'heartbeat',
    })
    expect(payload.create).toHaveBeenCalledTimes(1)
  })

  it('preserves an existing onInit hook before attaching the writer', async () => {
    const order: string[] = []
    const incoming = fakeIncomingConfig({
      onInit: async () => {
        order.push('client')
      },
    })
    const result = auditPlugin({})(incoming)
    const final = (await Promise.resolve(result)) as Config

    const payload = fakePayload()
    await final.onInit?.(payload)
    expect(order).toEqual(['client'])

    // Writer is attached after the client onInit completes.
    const writer = getAuditWriter(payload as unknown as object)
    expect(writer).toBeDefined()
  })

  it('getAuditWriter throws a clear error when audit is not attached', () => {
    expect(() => getAuditWriter({})).toThrow(/Audit writer not found/)
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { Inngest } from 'inngest'
import type { Payload } from 'payload'
import { createAuditWriter, type AuditEventInput } from './writer.js'

function makePayload(overrides: Partial<Payload> = {}) {
  const create = vi.fn(async () => ({ id: 'evt_1' }))
  return {
    create,
    fake: { create },
    payload: { create, ...overrides } as unknown as Payload,
  }
}

function makeInngest() {
  const send = vi.fn(async () => ({}))
  return { send, inngest: { send } as unknown as Inngest }
}

const baseEvent: AuditEventInput = {
  actor: { type: 'system' },
  action: 'content.update',
  mcpServer: 'payload',
  mcpTool: 'payload.collection.update',
  targetCollection: 'pages',
  targetId: 'p1',
  targetTitle: 'Homepage',
}

describe('createAuditWriter', () => {
  it('persists an event with a generated summary', async () => {
    const { fake, payload } = makePayload()
    const write = createAuditWriter({ payload })
    await write(baseEvent)

    expect(fake.create).toHaveBeenCalledTimes(1)
    const args = fake.create.mock.calls[0]?.[0] as { collection: string; data: { summary: string } }
    expect(args.collection).toBe('audit-events')
    expect(args.data.summary).toBe('Updated Homepage in pages')
  })

  it('uses a custom slug when provided', async () => {
    const { fake, payload } = makePayload()
    const write = createAuditWriter({ payload, collectionSlug: 'my-audit' })
    await write(baseEvent)

    const args = fake.create.mock.calls[0]?.[0] as { collection: string }
    expect(args.collection).toBe('my-audit')
  })

  it('honors a caller-provided summary', async () => {
    const { fake, payload } = makePayload()
    const write = createAuditWriter({ payload })
    await write({ ...baseEvent, summary: 'Custom summary' })

    const args = fake.create.mock.calls[0]?.[0] as { data: { summary: string } }
    expect(args.data.summary).toBe('Custom summary')
  })

  it('falls back to a generic summary for unmatched actions', async () => {
    const { fake, payload } = makePayload()
    const write = createAuditWriter({ payload })
    await write({
      ...baseEvent,
      action: 'system.healthcheck',
      mcpServer: 'audit',
      mcpTool: 'audit.heartbeat',
    })

    const args = fake.create.mock.calls[0]?.[0] as { data: { summary: string } }
    expect(args.data.summary).toBe('system.healthcheck (audit:audit.heartbeat)')
  })

  it('strips undefined fields from the persisted data', async () => {
    const { fake, payload } = makePayload()
    const write = createAuditWriter({ payload })
    await write(baseEvent)

    const args = fake.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    for (const value of Object.values(args.data)) {
      expect(value).not.toBe(undefined)
    }
  })

  it('does not throw when payload.create rejects; logs error', async () => {
    const create = vi.fn(async () => {
      throw new Error('db down')
    })
    const error = vi.fn()
    const write = createAuditWriter({
      payload: { create } as unknown as Payload,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error },
    })

    await expect(write(baseEvent)).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith(
      'Audit event write failed',
      expect.objectContaining({ error: expect.stringContaining('db down') }),
    )
  })

  it('fires audit/event.recorded when an Inngest client is provided', async () => {
    const { payload } = makePayload()
    const { send, inngest } = makeInngest()
    const write = createAuditWriter({ payload, inngest })

    await write(baseEvent)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      name: 'audit/event.recorded',
      data: { auditEventId: 'evt_1', action: 'content.update', targetCollection: 'pages' },
    })
  })

  it('does not throw when Inngest send fails; logs warning', async () => {
    const { payload } = makePayload()
    const send = vi.fn(async () => {
      throw new Error('inngest unreachable')
    })
    const warn = vi.fn()
    const write = createAuditWriter({
      payload,
      inngest: { send } as unknown as Inngest,
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
    })

    await expect(write(baseEvent)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      'Audit Inngest event send failed',
      expect.objectContaining({ error: expect.stringContaining('inngest unreachable') }),
    )
  })
})

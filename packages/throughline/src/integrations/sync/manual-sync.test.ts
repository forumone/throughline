import { describe, expect, it } from 'vitest'
import type { Inngest } from 'inngest'
import type { Payload } from 'payload'
import { MANUAL_SYNC_EVENT, requestManualSync } from './manual-sync.js'

const SLUG = 'integrations'

interface Doc {
  id: string
  name: string
  integrationType: string
  enabled: boolean
  lastSyncAt?: Date | string
}

function deps(docs: Doc[], sendImpl?: () => Promise<void>) {
  const sends: Array<{ name: string; data: unknown }> = []
  const payload = {
    findByID: async ({ id }: { id: string }) => {
      const found = docs.find((doc) => doc.id === id)
      if (!found) throw new Error('Not found')
      return found
    },
  } as unknown as Payload
  const inngest = {
    send: async (event: { name: string; data: unknown }) => {
      if (sendImpl) await sendImpl()
      sends.push(event)
    },
  } as unknown as Inngest
  return { deps: { payload, collectionSlug: SLUG, inngest }, sends }
}

const enabled: Doc = {
  id: 'inst-1',
  name: 'Greenhouse',
  integrationType: 'greenhouse',
  enabled: true,
  lastSyncAt: '2026-08-29T10:00:00.000Z',
}
const disabled: Doc = { id: 'inst-2', name: 'Webhook', integrationType: 'webhook', enabled: false }

describe('requestManualSync', () => {
  it('sends the event for an enabled instance', async () => {
    const { deps: d, sends } = deps([enabled])
    const result = await requestManualSync(d, {
      instanceId: 'inst-1',
      triggeredBy: 'u-1',
      reason: 'after a config change',
    })

    expect(result).toMatchObject({
      ok: true,
      instanceName: 'Greenhouse',
      integrationType: 'greenhouse',
      lastSyncAt: '2026-08-29T10:00:00.000Z',
    })
    expect(sends).toHaveLength(1)
    expect(sends[0]?.name).toBe(MANUAL_SYNC_EVENT)
    expect(sends[0]?.data).toEqual({
      integrationId: 'greenhouse',
      instanceId: 'inst-1',
      triggeredBy: 'u-1',
      reason: 'after a config change',
    })
  })

  it('normalises a Date lastSyncAt from the local API', async () => {
    const { deps: d } = deps([{ ...enabled, lastSyncAt: new Date('2026-08-29T10:00:00.000Z') }])
    const result = await requestManualSync(d, { instanceId: 'inst-1' })
    expect(result).toMatchObject({ ok: true, lastSyncAt: '2026-08-29T10:00:00.000Z' })
  })

  it('reports never-run as a null baseline rather than omitting it', async () => {
    const { deps: d } = deps([{ ...enabled, lastSyncAt: undefined }])
    const result = await requestManualSync(d, { instanceId: 'inst-1' })
    expect(result).toMatchObject({ ok: true, lastSyncAt: null })
  })

  it('refuses an unknown id without sending', async () => {
    const { deps: d, sends } = deps([enabled])
    const result = await requestManualSync(d, { instanceId: 'nope' })
    expect(result).toMatchObject({ ok: false, code: 'not-found' })
    expect(sends).toHaveLength(0)
  })

  it('refuses a disabled instance by name, without sending', async () => {
    const { deps: d, sends } = deps([disabled])
    const result = await requestManualSync(d, { instanceId: 'inst-2' })
    expect(result).toMatchObject({ ok: false, code: 'disabled' })
    expect(result.ok === false && result.message).toMatch(/"Webhook" is disabled/)
    expect(sends).toHaveLength(0)
  })

  // A send that throws used to escape the tool as an unhandled rejection. A
  // queued-but-not-really sync is indistinguishable from a slow one, so it has
  // to come back as a refusal.
  it('turns an unreachable Inngest into a send-failed refusal', async () => {
    const { deps: d } = deps([enabled], async () => {
      throw new Error('ECONNREFUSED')
    })
    const result = await requestManualSync(d, { instanceId: 'inst-1' })
    expect(result).toMatchObject({ ok: false, code: 'send-failed' })
    expect(result.ok === false && result.message).toMatch(/ECONNREFUSED/)
  })

  it('records nulls rather than dropping the keys when nobody said who or why', async () => {
    const { deps: d, sends } = deps([enabled])
    await requestManualSync(d, { instanceId: 'inst-1' })
    expect(sends[0]?.data).toMatchObject({ triggeredBy: null, reason: null })
  })
})

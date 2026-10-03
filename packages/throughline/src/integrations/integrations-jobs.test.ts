import type { JobContext } from '../jobs/index.js'
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { validateOptions } from './options.js'
import { integrationsJobs } from './plugin.js'
import { MANUAL_SYNC_EVENT, requestManualSync } from './sync/manual-sync.js'
import type { Integration, IntegrationContext } from './types.js'

/*
Integrations on a site with no Inngest: their jobs come from `createJobs`, the
context comes off Payload when a job runs, and events go out through `emit`.
*/

const CONTEXT = Symbol.for('@forumone/throughline/integrations-context')

function jobContext(
  payload: Payload | undefined,
  event: { name: string; data: unknown },
): JobContext {
  return {
    event,
    step: {
      run: async (_id, fn) => fn(),
      sleepUntil: async () => undefined,
      sendEvent: async () => undefined,
    },
    runId: 'run-1',
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    emit: async () => undefined,
    ...(payload ? { payload } : {}),
  }
}

const custom = {
  id: 'custom',
  name: 'Custom',
  description: '',
  category: 'other',
  configFields: [],
  validateConfig: async () => ({ valid: true }),
  subscribes: [],
  createFunctions: () => [],
  createJobs: (getContext) => [
    {
      id: 'custom-sync',
      on: { cron: '0 3 * * *' },
      handler: async (job) => {
        await getContext(job).emit({ name: 'custom/synced', data: {} })
      },
    },
  ],
} as Integration

describe('integrationsJobs', () => {
  it("is the webhook's two jobs, then each integration's own", () => {
    expect(integrationsJobs({ integrations: [custom] }).map((job) => job.id)).toEqual([
      'webhook-deliver',
      'webhook-manual-trigger',
      'custom-sync',
    ])
  })

  it('leaves out an integration with no createJobs, which runs on Inngest only', () => {
    const { createJobs: _createJobs, ...inngestOnly } = custom
    expect(integrationsJobs({ integrations: [inngestOnly as Integration] })).toHaveLength(2)
  })

  it('reads the context integrationsPlugin put on Payload, when the job runs', async () => {
    const emit = vi.fn(async () => undefined)
    const payload = {} as Payload
    Object.defineProperty(payload, CONTEXT, { value: { emit } as unknown as IntegrationContext })

    const job = integrationsJobs({ integrations: [custom] }).find((j) => j.id === 'custom-sync')!
    await job.handler(jobContext(payload, { name: 'cron', data: {} }))

    expect(emit).toHaveBeenCalledWith({ name: 'custom/synced', data: {} })
  })

  it('says what is missing, rather than failing on undefined', async () => {
    const [deliver] = integrationsJobs()
    await expect(deliver!.handler(jobContext(undefined, { name: 'x', data: {} }))).rejects.toThrow(
      /no Payload instance/,
    )
    await expect(
      deliver!.handler(jobContext({} as Payload, { name: 'x', data: {} })),
    ).rejects.toThrow(/Register integrationsPlugin/)
  })
})

describe('without Inngest', () => {
  it('accepts emit in place of an Inngest client, and refuses neither', () => {
    expect(() => validateOptions({ emit: async () => undefined })).not.toThrow()
    expect(() => validateOptions({})).toThrow(/Inngest client .* or a jobs adapter's `emit`/)
  })

  it('sends a manual sync through emit', async () => {
    const emit = vi.fn(async () => undefined)
    const payload = {
      findByID: async () => ({
        id: 'inst-1',
        name: 'Hook',
        integrationType: 'webhook',
        enabled: true,
      }),
    } as unknown as Payload

    const result = await requestManualSync(
      { payload, collectionSlug: 'integrations', emit },
      { instanceId: 'inst-1' },
    )

    expect(result).toMatchObject({ ok: true })
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ name: MANUAL_SYNC_EVENT }))
  })
})

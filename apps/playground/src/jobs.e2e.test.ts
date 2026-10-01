import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { getPublishingService } from '@forumone/throughline-publishing'
import { buildConfig, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { playgroundConfig } from './config'

/*
The playground's own configuration, on Payload Jobs, with no Inngest anywhere.

This is 1.0 P1's gate in a test: the jobs a Throughline site depends on run on
Payload's queue. It boots `playgroundConfig` — the same function
`payload.config.ts` calls — on an in-memory SQLite database instead of
Postgres, and drives the queue by hand where the dev server would run it every
minute.
*/

const revalidate = vi.fn(async () => undefined)
let payload: Payload

beforeAll(async () => {
  const config = await buildConfig({
    ...playgroundConfig({
      db: sqliteAdapter({ client: { url: ':memory:' } }),
      autoRun: false,
      revalidate,
    }),
    logger: { options: { level: 'silent' } },
  })
  payload = await getPayload({ config })
}, 120_000)

afterAll(async () => {
  await payload?.destroy?.()
})

const runQueue = () => payload.jobs.run({ queue: 'throughline', overrideAccess: true })

async function draftPage(slug: string, extra: Record<string, unknown> = {}) {
  const page = await payload.create({
    collection: 'pages',
    draft: true,
    data: {
      title: `Page ${slug}`,
      slug,
      seo: { title: `Page ${slug}`, description: 'A page.' },
      _status: 'draft',
      ...extra,
    },
    overrideAccess: true,
  })
  return page.id
}

async function liveStatus(id: number | string) {
  const page = await payload.findByID({ collection: 'pages', id, draft: false, overrideAccess: true })
  return (page as { _status?: string })._status
}

describe('the playground on Payload Jobs', () => {
  it('revalidates a published page, through the revalidation job', async () => {
    const id = await draftPage('about')
    const outcome = await getPublishingService(payload).publish({
      collection: 'pages',
      id,
      actor: { apiKeyName: 'test', channel: 'mcp' },
      meta: { reasoning: 'test' },
    })
    expect(outcome.published, outcome.reason).toBe(true)

    await runQueue()

    expect(revalidate).toHaveBeenCalledWith(expect.objectContaining({ path: '/about' }))
  })

  it('publishes a scheduled page at its time, through the scheduled-publish job', async () => {
    const at = new Date(Date.now() + 2000).toISOString()
    const id = await draftPage('later', { scheduledPublishAt: at })

    await runQueue()
    expect(await liveStatus(id)).not.toBe('published')

    await new Promise((resolve) => setTimeout(resolve, 2200))
    await runQueue()

    expect(await liveStatus(id)).toBe('published')
  })
})

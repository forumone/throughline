import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { createMcpToolCollector } from '../../index.js'
import type { McpToolContext } from '../../index.js'
import { buildConfig, getPayload, type CollectionConfig, type Payload } from 'payload'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorialPlugin, YOUR_WORK_DASHBOARD_PATH } from '../plugin.js'
import { createListMyWorkTool, toolWork } from './tool.js'
import { readYourWork, type WorkOptions } from './work.js'
import { YourWorkReport } from './YourWork.js'

/*
"Your work" against a real Payload and database, and the parity test 1.0's plan
asks of every editorial move: the rows the tool returns are the rows the
dashboard draws, linked the same way.
*/

const Users: CollectionConfig = { slug: 'users', auth: true, fields: [] }

const page = (slug: string): CollectionConfig => ({
  slug,
  labels: { singular: slug === 'pages' ? 'Page' : 'Post', plural: slug },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'scheduledPublishAt', type: 'date' },
  ],
})

const work: WorkOptions = { collections: ['pages', 'posts'], limit: 3 }
const collector = createMcpToolCollector()
let payload: Payload
let user: Awaited<ReturnType<Payload['create']>>

const now = new Date('2026-10-01T12:00:00.000Z')
const later = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()
const tick = () => new Promise((resolve) => setTimeout(resolve, 2))

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'test-secret-test-secret-test-secret',
    db: sqliteAdapter({ client: { url: ':memory:' } }),
    admin: { user: 'users', components: { beforeDashboard: ['/host#Banner'] } },
    collections: [Users, page('pages'), page('posts')],
    plugins: [editorialPlugin({ work, mcpTools: collector })],
    logger: { options: { level: 'silent' } },
    // Otherwise getPayload forks `payload generate:types`, which hangs and outlives the run.
    typescript: { autoGenerate: false },
  })
  payload = await getPayload({ config })
  user = await payload.create({
    collection: 'users',
    data: { email: 'e@example.com', password: 'pw-pw-pw-pw' },
  })

  // Saved in order, a millisecond apart, so "newest first" has an answer.
  for (const [collection, title] of [
    ['pages', 'Oldest draft'],
    ['posts', 'Middle draft'],
    ['pages', 'Newest draft'],
  ] as const) {
    await payload.create({ collection, draft: true, data: { title, _status: 'draft' } })
    await tick()
  }
  await payload.create({ collection: 'pages', data: { title: 'Live', _status: 'published' } })
  await payload.create({
    collection: 'posts',
    draft: true,
    data: { title: 'Goes out Friday', _status: 'draft', scheduledPublishAt: later(3) },
  })
  await payload.create({
    collection: 'pages',
    draft: true,
    data: { title: 'Goes out tomorrow', _status: 'draft', scheduledPublishAt: later(1) },
  })
  await payload.create({
    collection: 'pages',
    draft: true,
    data: { title: 'Already past', _status: 'draft', scheduledPublishAt: later(-1) },
  })
}, 120_000)

afterAll(async () => {
  await payload?.destroy?.()
})

describe('readYourWork', () => {
  it('lists unpublished changes across collections, newest first, up to the limit', async () => {
    const { changes } = await readYourWork(payload, { work, user, now })
    expect(changes.map((row) => [row.title, row.label])).toEqual([
      ['Already past', 'Page'],
      ['Goes out tomorrow', 'Page'],
      ['Goes out Friday', 'Post'],
    ])
    const all = await readYourWork(payload, { work: { ...work, limit: 10 }, user, now })
    expect(all.changes.map((row) => row.title)).not.toContain('Live')
    expect(all.changes.map((row) => row.title).slice(-3)).toEqual([
      'Newest draft',
      'Middle draft',
      'Oldest draft',
    ])
  })

  it('lists future schedules, soonest first', async () => {
    const { scheduled } = await readYourWork(payload, { work, user, now })
    expect(scheduled.map((row) => row.title)).toEqual(['Goes out tomorrow', 'Goes out Friday'])
  })
})

describe('parity: the dashboard and the tool show the same rows', () => {
  const ctx = () =>
    ({
      user: { id: String(user.id), email: 'e@example.com', name: 'E', roles: [], groups: [] },
      apiKeyName: 'test',
      logger: console,
    }) as unknown as McpToolContext

  it('draws every row the tool returns, with the same link', async () => {
    const fromTool = (await createListMyWorkTool({ payload, work }).handler(
      {},
      ctx(),
    )) as ReturnType<typeof toolWork>
    const result = await readYourWork(payload, { work, user })
    expect(fromTool).toEqual(toolWork({ ...result, generatedAt: fromTool.generatedAt }, '/admin'))

    const html = renderToStaticMarkup(
      createElement(YourWorkReport, { work: result, adminRoute: '/admin' }),
    )
    const rows = [...fromTool.unpublishedChanges, ...fromTool.scheduledToPublish]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(html).toContain(`href="${row.adminUrl}"`)
      expect(html).toContain(`>${row.title}</a>`)
    }
  })

  it('refuses a caller with no identity', async () => {
    const tool = createListMyWorkTool({ payload, work })
    expect(await tool.handler({}, { ...ctx(), user: null } as McpToolContext)).toHaveProperty(
      'error',
    )
  })
})

describe('the plugin', () => {
  it('puts the dashboard first in beforeDashboard, keeping the host’s own', () => {
    expect(payload.config.admin.components?.beforeDashboard).toEqual([
      YOUR_WORK_DASHBOARD_PATH,
      '/host#Banner',
    ])
    expect(collector.unbound).toEqual([])
    expect(collector.tools.map((tool) => tool.name)).toContain('list_my_work')
  })

  it('leaves the dashboard alone when told to', () => {
    const config = editorialPlugin({ work: { ...work, dashboard: false } })({})
    expect(config.admin?.components?.beforeDashboard).toBeUndefined()
  })
})

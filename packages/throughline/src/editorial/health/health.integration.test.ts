import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { createMcpToolCollector } from '../../index.js'
import { findReferencedIds } from '../../media/index.js'
import type { McpToolContext } from '../../index.js'
import { buildConfig, getPayload, type CollectionConfig, type Payload } from 'payload'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorialRuntime } from '../config.js'
import { editorialPlugin, CONTENT_HEALTH_VIEW_PATH } from '../plugin.js'
import { missingAltCheck, missingSeoCheck, staleCheck, type HealthCheck } from './checks.js'
import { ContentHealthReport } from './ContentHealthReport.js'
import { findContentNeedingAttention } from './find.js'
import { createFindContentNeedingAttentionTool, toolReport } from './tool.js'

/*
Content health against a real Payload and database.

The parity test is the one 1.0's plan asks every editorial move for: the admin
view and the MCP tool must show the same rows. Both are built from one
`findContentNeedingAttention` report, so the test renders the view's markup and
checks that every document the tool returns is in it, linked the same way.
*/

const now = new Date('2026-09-29T12:00:00.000Z')
const old = '2024-01-01T00:00:00.000Z'
const recent = '2026-09-01T00:00:00.000Z'

const Users: CollectionConfig = { slug: 'users', auth: true, fields: [] }

const Media: CollectionConfig = {
  slug: 'media',
  fields: [
    { name: 'filename', type: 'text' },
    { name: 'mimeType', type: 'text' },
    { name: 'alt', type: 'text' },
  ],
}

const Pages: CollectionConfig = {
  slug: 'pages',
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'publishedAt', type: 'date' },
    { name: 'revisedAt', type: 'date' },
    { name: 'hero', type: 'relationship', relationTo: 'media' },
    {
      name: 'meta',
      type: 'group',
      fields: [
        { name: 'description', type: 'text' },
        { name: 'image', type: 'relationship', relationTo: 'media' },
        { name: 'noIndex', type: 'checkbox' },
      ],
    },
  ],
}

const checks: HealthCheck[] = [
  staleCheck({ after: { pages: 12 }, label: 'Not revised in a year' }),
  missingSeoCheck({ collections: ['pages'] }),
  missingAltCheck({ inUse: findReferencedIds }),
]

const collector = createMcpToolCollector()
let payload: Payload
let user: Awaited<ReturnType<Payload['create']>>

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'test-secret-test-secret-test-secret',
    db: sqliteAdapter({ client: { url: ':memory:' } }),
    admin: { user: 'users' },
    collections: [Users, Media, Pages],
    plugins: [editorialPlugin({ health: { checks }, mcpTools: collector })],
    logger: { options: { level: 'silent' } },
    // Otherwise getPayload forks `payload generate:types`, which hangs and outlives the run.
    typescript: { autoGenerate: false },
  })
  payload = await getPayload({ config })
  user = await payload.create({
    collection: 'users',
    data: { email: 'e@example.com', password: 'pw-pw-pw-pw' },
  })

  const image = await payload.create({
    collection: 'media',
    data: { filename: 'used.jpg', mimeType: 'image/jpeg' },
  })
  await payload.create({
    collection: 'media',
    data: { filename: 'unused.jpg', mimeType: 'image/jpeg' },
  })
  await payload.create({
    collection: 'media',
    data: { filename: 'fine.jpg', mimeType: 'image/jpeg', alt: 'A cat' },
  })

  const page = (title: string, data: Record<string, unknown>) =>
    payload.create({ collection: 'pages', data: { title, _status: 'published', ...data } })
  await page('Oldest', { publishedAt: old, meta: { description: 'd', image: image.id } })
  await page('Old revision', {
    publishedAt: old,
    revisedAt: '2025-01-01T00:00:00.000Z',
    meta: { description: 'd' },
  })
  await page('Fresh', {
    publishedAt: recent,
    hero: image.id,
    meta: { description: 'd', image: image.id },
  })
  await page('Hidden', { publishedAt: recent, meta: { noIndex: true } })
  await payload.create({
    collection: 'pages',
    data: { title: 'Never published', _status: 'draft' },
    draft: true,
  })
}, 120_000)

afterAll(async () => {
  await payload?.destroy?.()
})

const byId = (report: Awaited<ReturnType<typeof findContentNeedingAttention>>, id: string) =>
  report.checks.find((check) => check.id === id)!

describe('findContentNeedingAttention', () => {
  it('lists stale pages oldest first, dated by the first date set', async () => {
    const report = await findContentNeedingAttention(payload, { checks, user, now })
    const [group] = byId(report, 'stale').groups
    expect(group?.rows.map((row) => [row.title, row.at])).toEqual([
      ['Oldest', old],
      ['Old revision', '2025-01-01T00:00:00.000Z'],
    ])
  })

  it('lists published, indexable pages missing SEO, and says what is missing', async () => {
    const report = await findContentNeedingAttention(payload, { checks, user, now })
    const [group] = byId(report, 'missing-seo').groups
    expect(group?.rows.map((row) => [row.title, row.note])).toEqual([['Old revision', 'no image']])
  })

  it('lists only the images in use without alt, and counts the rest', async () => {
    const report = await findContentNeedingAttention(payload, { checks, user, now })
    const [group] = byId(report, 'missing-alt').groups
    expect(group?.rows.map((row) => row.title)).toEqual(['used.jpg'])
    expect(group?.excluded).toBe(1)
  })

  it('in a summary, counts the same totals, lists nothing and skips what is costly', async () => {
    const full = await findContentNeedingAttention(payload, { checks, user, now })
    const summary = await findContentNeedingAttention(payload, {
      checks,
      user,
      now,
      scope: 'summary',
    })
    for (const id of ['stale', 'missing-seo']) {
      expect(byId(summary, id).groups.map((g) => g.total)).toEqual(
        byId(full, id).groups.map((g) => g.total),
      )
      expect(byId(summary, id).groups.every((g) => g.rows.length === 0)).toBe(true)
    }
    expect(byId(summary, 'missing-alt').skipped).toBe('costly')
  })

  it('reports "could not check" rather than nothing, when a check throws', async () => {
    const broken = missingAltCheck({
      inUse: async () => {
        throw new Error('no scan')
      },
    })
    const report = await findContentNeedingAttention(payload, { checks: [broken], user, now })
    expect(report.checks[0]?.skipped).toBe('failed')
  })
})

describe('parity: the view and the tool show the same rows', () => {
  it('renders every document the tool returns, with the same link', async () => {
    const tool = createFindContentNeedingAttentionTool({ payload, checks })
    const ctx = {
      user: { id: String(user.id), email: 'e@example.com', name: 'E', roles: [], groups: [] },
      apiKeyName: 'test',
      logger: console,
    } as unknown as McpToolContext

    const fromTool = (await tool.handler({}, ctx)) as ReturnType<typeof toolReport>
    // The view's own report, read as the view reads it.
    const report = await findContentNeedingAttention(payload, { checks, user })
    expect(fromTool).toEqual(toolReport({ ...report, generatedAt: fromTool.generatedAt }, '/admin'))

    const html = renderToStaticMarkup(
      createElement(ContentHealthReport, { report, adminRoute: '/admin' }),
    )
    const documents = fromTool.checks.flatMap((check) =>
      check.groups.flatMap((group) => group.documents),
    )
    expect(documents.length).toBeGreaterThan(0)
    for (const document of documents) {
      expect(html).toContain(`href="${document.adminUrl}"`)
      expect(html).toContain(`>${document.title}</a>`)
    }
  })

  it('refuses a caller with no identity, and an unknown check', async () => {
    const tool = createFindContentNeedingAttentionTool({ payload, checks })
    const anonymous = { user: null, apiKeyName: 'k', logger: console } as unknown as McpToolContext
    expect(await tool.handler({}, anonymous)).toHaveProperty('error')
    const ctx = {
      ...anonymous,
      user: { id: String(user.id), roles: [] },
    } as unknown as McpToolContext
    expect(await tool.handler({ checks: ['nope'] }, ctx)).toEqual({
      error: 'Unknown check nope. Known: stale, missing-seo, missing-alt.',
    })
  })
})

describe('the plugin', () => {
  it('registers the view, leaves the checks for it, and binds the tool', () => {
    const views = payload.config.admin.components?.views as Record<
      string,
      { Component: unknown; path: string }
    >
    expect(views['contentHealth']).toMatchObject({
      Component: CONTENT_HEALTH_VIEW_PATH,
      path: '/content-health',
    })
    expect(editorialRuntime(payload.config).health?.checks).toHaveLength(3)
    expect(collector.unbound).toEqual([])
    expect(collector.tools.map((tool) => tool.name)).toContain('find_content_needing_attention')
  })

  it('refuses two checks with one id', () => {
    expect(() =>
      editorialPlugin({
        health: { checks: [staleCheck({ after: {} }), staleCheck({ after: {} })] },
      })({}),
    ).toThrow(/two health checks share the id "stale"/)
  })
})

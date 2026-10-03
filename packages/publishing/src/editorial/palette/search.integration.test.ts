import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { createMcpToolCollector } from '@forumone/throughline'
import type { McpToolContext } from '@forumone/throughline'
import { buildConfig, getPayload, type CollectionConfig, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { staleCheck } from '../health/checks.js'
import { COMMAND_PALETTE_PATH, editorialPlugin, REPORTS_NAV_PATH } from '../plugin.js'
import { searchContent } from './search.js'
import type { SearchSource } from './sources.js'
import { createSearchContentTool } from './tool.js'

/*
The palette's search against a real Payload and database, and the parity the
plan asks for: `search_content` runs the query the palette sends (`searchWhere`;
`sources.test.ts` holds that `searchUrl` is written from it), and ranks what
comes back the same way.
*/

const Users: CollectionConfig = { slug: 'users', auth: true, fields: [] }

const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'slug', type: 'text' },
  ],
}

const People: CollectionConfig = {
  slug: 'people',
  labels: { singular: 'Person', plural: 'People' },
  fields: [{ name: 'name', type: 'text' }],
}

const sources: SearchSource[] = [
  { slug: 'pages', titleField: 'title', searchFields: ['title', 'slug'], drafts: true },
  { slug: 'people', titleField: 'name', searchFields: ['name'], drafts: false },
]

const collector = createMcpToolCollector()
let payload: Payload
let user: Awaited<ReturnType<Payload['create']>>

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'test-secret-test-secret-test-secret',
    db: sqliteAdapter({ client: { url: ':memory:' } }),
    admin: {
      user: 'users',
      components: { providers: ['/host#Session'], afterNavLinks: ['/host#Extra'] },
    },
    collections: [Users, Pages, People],
    plugins: [
      editorialPlugin({
        health: { checks: [staleCheck({ after: { pages: 12 } })] },
        palette: { sources, preferenceKey: 'site-recent' },
        reports: [{ path: '/elsewhere', label: 'Elsewhere' }],
        mcpTools: collector,
      }),
    ],
    logger: { options: { level: 'silent' } },
    // Otherwise getPayload forks `payload generate:types`, which hangs and outlives the run.
    typescript: { autoGenerate: false },
  })
  payload = await getPayload({ config })
  user = await payload.create({
    collection: 'users',
    data: { email: 'e@example.com', password: 'pw-pw-pw-pw' },
  })

  await payload.create({
    collection: 'pages',
    data: { title: 'What we talk about', slug: 'talk', _status: 'published' },
  })
  await payload.create({
    collection: 'pages',
    data: { title: 'About', slug: 'about', _status: 'published' },
  })
  // Only ever a draft: the palette finds those too.
  await payload.create({
    collection: 'pages',
    draft: true,
    data: { title: 'About us (draft)', _status: 'draft' },
  })
  await payload.create({ collection: 'people', data: { name: 'Ada Aboutson' } })
  await payload.create({ collection: 'people', data: { name: 'Grace' } })
}, 120_000)

afterAll(async () => {
  await payload?.destroy?.()
})

describe('searchContent', () => {
  it('finds across collections, drafts included, ranked as the palette ranks', async () => {
    const hits = await searchContent(payload, { sources, query: 'about', user })
    expect(hits.map((hit) => [hit.title, hit.label, hit.rank])).toEqual([
      ['About', 'Page', 0],
      ['About us (draft)', 'Page', 1],
      ['What we talk about', 'Page', 2],
      ['Ada Aboutson', 'Person', 2],
    ])
  })

  it('matches any search field, and nothing for an empty query', async () => {
    expect(
      (await searchContent(payload, { sources, query: 'talk', user })).map((hit) => hit.title),
    ).toEqual(['What we talk about'])
    expect(await searchContent(payload, { sources, query: '  ', user })).toEqual([])
  })
})

describe('search_content', () => {
  const ctx = () =>
    ({
      user: { id: String(user.id), email: 'e@example.com', name: 'E', roles: [], groups: [] },
      apiKeyName: 'test',
      logger: console,
    }) as unknown as McpToolContext

  it('returns what searchContent finds, each with its admin link', async () => {
    const tool = createSearchContentTool({ payload, sources })
    const result = (await tool.handler({ query: 'about' }, ctx())) as {
      results: { title: string; adminUrl: string; collection: string; id: number | string }[]
    }
    const direct = await searchContent(payload, { sources, query: 'about', user })
    expect(result.results.map((hit) => [hit.collection, hit.id])).toEqual(
      direct.map((hit) => [hit.collection, hit.id]),
    )
    expect(result.results[0]?.adminUrl).toMatch(/^\/admin\/collections\/pages\/\d+$/)
  })

  it('narrows by collection, and refuses one it does not search', async () => {
    const tool = createSearchContentTool({ payload, sources })
    const people = (await tool.handler({ query: 'a', collections: ['people'] }, ctx())) as {
      results: { collection: string }[]
    }
    expect(new Set(people.results.map((hit) => hit.collection))).toEqual(new Set(['people']))
    expect(await tool.handler({ query: 'a', collections: ['users'] }, ctx())).toHaveProperty(
      'error',
    )
  })

  it('refuses a caller with no identity', async () => {
    const tool = createSearchContentTool({ payload, sources })
    expect(
      await tool.handler({ query: 'a' }, { ...ctx(), user: null } as McpToolContext),
    ).toHaveProperty('error')
  })
})

describe('the plugin', () => {
  type Entry = string | { path: string; clientProps?: Record<string, unknown> }
  const components = () =>
    payload.config.admin.components as { providers: Entry[]; afterNavLinks: Entry[] }
  const reports = [
    { path: '/content-health', label: 'Content health', keywords: 'stale seo alt review' },
    { path: '/elsewhere', label: 'Elsewhere' },
  ]

  it('mounts the palette after the host’s providers, with its sources and the reports', () => {
    const [host, palette] = components().providers
    expect(host).toBe('/host#Session')
    expect(palette).toMatchObject({
      path: COMMAND_PALETTE_PATH,
      clientProps: { sources, reports, preferenceKey: 'site-recent' },
    })
  })

  it('adds the Reports group after the host’s nav links, with the views it registered and the host’s', () => {
    expect(components().afterNavLinks).toEqual([
      '/host#Extra',
      { path: REPORTS_NAV_PATH, clientProps: { reports } },
    ])
  })

  it('binds search_content', () => {
    expect(collector.unbound).toEqual([])
    expect(collector.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['search_content', 'find_content_needing_attention']),
    )
  })

  it('adds no Reports group when told not to, or when there is nothing in it', () => {
    expect(
      editorialPlugin({ reportsNav: false, reports })({}).admin?.components?.afterNavLinks,
    ).toBeUndefined()
    expect(
      editorialPlugin({ palette: { sources } })({}).admin?.components?.afterNavLinks,
    ).toBeUndefined()
  })
})

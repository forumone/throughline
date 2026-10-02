import { sqliteAdapter } from '@payloadcms/db-sqlite'
import type { McpToolContext } from '@forumone/throughline-plugin-contract'
import { buildConfig, getPayload, type CollectionConfig, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMcpToolCollector } from '../mcp/collector.js'
import { checkSlug, createCheckSlugTool, fieldsPlugin } from './checkSlug.js'
import { refuseSlugHeldInTrash, slugField } from './slug.js'

/*
`check_slug` and the slug guard against a real Payload and database, where the
unique index and the trash are real.
*/

const Pages: CollectionConfig = {
  slug: 'pages',
  trash: true,
  hooks: { beforeValidate: [refuseSlugHeldInTrash('pages')] },
  fields: [{ name: 'title', type: 'text' }, slugField()],
}

const Notes: CollectionConfig = { slug: 'notes', fields: [{ name: 'title', type: 'text' }] }

const collector = createMcpToolCollector()
let payload: Payload

const editor = {
  user: { id: '1', email: 'e@example.com', name: 'E', roles: ['editor'], groups: [] },
  apiKeyName: 'test',
  logger: console,
} as unknown as McpToolContext

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'test-secret-test-secret-test-secret',
    db: sqliteAdapter({ client: { url: ':memory:' } }),
    collections: [Pages, Notes],
    plugins: [fieldsPlugin({ mcpTools: collector })],
    logger: { options: { level: 'silent' } },
    // Otherwise getPayload forks `payload generate:types`, which hangs and outlives the run.
    typescript: { autoGenerate: false },
  })
  payload = await getPayload({ config })

  await payload.create({ collection: 'pages', data: { title: 'About Us' } })
  await payload.create({ collection: 'pages', data: { title: 'About Us', slug: 'about-us-2' } })
  const gone = await payload.create({ collection: 'pages', data: { title: 'Old team' } })
  await payload.update({
    collection: 'pages',
    id: gone.id,
    data: { deletedAt: new Date().toISOString() },
  })
}, 120_000)

afterAll(async () => {
  await payload?.destroy?.()
})

describe('the slug field', () => {
  it('follows the title', async () => {
    const page = await payload.create({ collection: 'pages', data: { title: 'Our Work!' } })
    expect(page.slug).toBe('our-work')
  })

  it('refuses a slug a trashed page holds, naming it', async () => {
    // The detail is on the error's `data`, which is what the admin shows on the field.
    await expect(
      payload.create({ collection: 'pages', data: { title: 'Old team' } }),
    ).rejects.toMatchObject({
      data: {
        errors: [
          {
            path: 'slug',
            message: expect.stringMatching(
              /^\/old-team belongs to "Old team", which is in the trash/,
            ),
          },
        ],
      },
    })
  })
})

describe('checkSlug', () => {
  it('normalises, and says a free slug is free', async () => {
    expect(await checkSlug(payload, 'pages', 'Brand New Page')).toEqual({
      collection: 'pages',
      slug: 'brand-new-page',
      available: true,
    })
  })

  it('names the holder and suggests the first free alternative', async () => {
    expect(await checkSlug(payload, 'pages', 'About Us')).toMatchObject({
      slug: 'about-us',
      available: false,
      takenBy: { title: 'About Us', trashed: false },
      // -2 is taken too.
      suggestion: 'about-us-3',
    })
  })

  it('counts a trashed holder, and says so', async () => {
    expect(await checkSlug(payload, 'pages', 'old team')).toMatchObject({
      available: false,
      takenBy: { title: 'Old team', trashed: true },
      suggestion: 'old-team-2',
    })
  })

  it('has nothing to say about an empty slug', async () => {
    expect(await checkSlug(payload, 'pages', '!!!')).toMatchObject({ slug: '', available: false })
  })
})

describe('check_slug', () => {
  it('answers through the plugin', async () => {
    expect(collector.unbound).toEqual([])
    expect(collector.tools.map((tool) => tool.name)).toContain('check_slug')
    const tool = createCheckSlugTool({ payload })
    expect(await tool.handler({ collection: 'pages', slug: 'Contact' }, editor)).toMatchObject({
      available: true,
    })
  })

  it('refuses a collection with no slug, an unknown one, and a caller without the role', async () => {
    const tool = createCheckSlugTool({ payload })
    expect(await tool.handler({ collection: 'notes', slug: 'x' }, editor)).toEqual({
      error: '"notes" has no slug field.',
    })
    expect(await tool.handler({ collection: 'nope', slug: 'x' }, editor)).toEqual({
      error: 'There is no collection "nope".',
    })
    const viewer = { ...editor, user: { ...editor.user!, roles: ['viewer'] } }
    expect(await tool.handler({ collection: 'pages', slug: 'x' }, viewer)).toHaveProperty('error')
  })
})

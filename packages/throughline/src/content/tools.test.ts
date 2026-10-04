import type { Field, Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { anonymousContext, fakeContext } from '../publishing/tools/_test-helpers.js'
import type { McpToolContext } from '../plugin-contract/index.js'
import {
  createDescribeContentTypeTool,
  createFindDocumentsTool,
  createFindRelatedTool,
  createGetDocumentTool,
  toWriteShape,
  type ContentToolDeps,
} from './tools.js'

// The request a tool reads as: only the user matters to these tools.
vi.mock('payload', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  createLocalReq: async ({ user }: { user?: unknown }) => ({ user }),
}))

const pageFields: Field[] = [
  {
    type: 'tabs',
    tabs: [
      {
        label: 'Content',
        fields: [
          { name: 'title', type: 'text', required: true },
          {
            name: 'layout',
            type: 'blocks',
            blocks: [{ slug: 'Quote', fields: [] }],
          },
        ],
      },
    ],
  },
  { name: 'slug', type: 'text' },
  { name: 'policy', type: 'group', fields: [{ name: 'requiresApproval', type: 'checkbox' }] },
]

const draftPage = {
  id: 7,
  title: 'About us',
  slug: 'about',
  _status: 'draft',
  updatedAt: '2026-10-01T00:00:00.000Z',
  layout: [{ id: 'b1', blockType: 'Quote' }],
  policy: { requiresApproval: false },
  createdAt: '2026-09-01T00:00:00.000Z',
}

function makeDeps(overrides: { find?: ReturnType<typeof vi.fn>; findByID?: ReturnType<typeof vi.fn> } = {}) {
  const find = overrides.find ?? vi.fn(async () => ({ docs: [draftPage] }))
  const findByID = overrides.findByID ?? vi.fn(async () => draftPage)
  const payload = {
    find,
    findByID,
    config: { routes: { admin: '/admin' }, serverURL: 'https://site.test', blocks: [] },
    collections: {
      pages: {
        config: {
          slug: 'pages',
          labels: { singular: 'Page', plural: 'Pages' },
          admin: {
            useAsTitle: 'title',
            preview: (doc: { slug?: string }) => (doc.slug ? `/next/preview?slug=${doc.slug}` : null),
          },
          versions: { drafts: true },
          fields: pageFields,
          flattenedFields: [{ name: 'title' }, { name: 'slug' }],
        },
      },
      people: {
        config: { slug: 'people', admin: { useAsTitle: 'name' }, fields: [], flattenedFields: [] },
      },
      media: {
        config: {
          slug: 'media',
          admin: { useAsTitle: 'alt' },
          upload: true,
          fields: [],
          flattenedFields: [],
        },
      },
      terms: {
        config: { slug: 'terms', admin: { useAsTitle: 'name' }, fields: [], flattenedFields: [] },
      },
    },
  } as unknown as Payload
  const deps: ContentToolDeps = {
    payload,
    collections: {
      pages: { fields: ['title', 'slug', 'layout'], templateDraws: ['PageHero'], publishRequires: ['meta.title'] },
    },
    related: {
      people: { collection: 'people' },
      media: { collection: 'media', searchFields: ['alt', 'filename'] },
      topics: { collection: 'terms', filters: ['type'] },
    },
  }
  return { deps, find, findByID }
}

const editor: McpToolContext = { ...fakeContext, user: { ...fakeContext.user!, roles: ['editor'] } }
const approver: McpToolContext = { ...fakeContext, user: { ...fakeContext.user!, roles: ['approver'] } }

describe('every content read tool', () => {
  const tools = [
    ['describe_content_type', createDescribeContentTypeTool, { collection: 'pages' }],
    ['find_documents', createFindDocumentsTool, { collection: 'pages' }],
    ['find_related', createFindRelatedTool, { kind: 'people' }],
    ['get_document', createGetDocumentTool, { collection: 'pages', id: 7 }],
  ] as const

  it.each(tools)('%s refuses a key with nobody behind it, before reading', async (_, create, input) => {
    const { deps, find, findByID } = makeDeps()
    const out = await create(deps).handler(input as never, anonymousContext)
    expect(out).toEqual({ error: expect.any(String) })
    expect(find).not.toHaveBeenCalled()
    expect(findByID).not.toHaveBeenCalled()
  })

  it.each(tools)('%s refuses somebody who is not an editor or an admin', async (_, create, input) => {
    const { deps } = makeDeps()
    expect(await create(deps).handler(input as never, approver)).toEqual({ error: expect.any(String) })
  })

  it.each(tools)('%s lets a host draw the line elsewhere', async (_, create, input) => {
    const { deps } = makeDeps()
    const out = await create({ ...deps, canUse: () => true }).handler(input as never, approver)
    expect(out).not.toHaveProperty('error')
  })
})

describe('describe_content_type', () => {
  it('describes the allow-listed fields, what the template draws and what publishing needs', async () => {
    const { deps } = makeDeps()
    const out = (await createDescribeContentTypeTool(deps).handler({ collection: 'pages' }, editor)) as Record<string, unknown>
    expect(out).toMatchObject({
      collection: 'pages',
      label: 'Page',
      drafts: true,
      templateDraws: ['PageHero'],
      publishing: { requires: ['meta.title'] },
    })
    expect((out['fields'] as { name: string }[]).map((f) => f.name)).toEqual(['title', 'layout', 'slug'])
  })

  it('says what a rich-text field takes: Markdown and HTML only when the site converts them', async () => {
    const { deps } = makeDeps()
    const config = (deps.payload.collections as unknown as Record<string, { config: { fields: Field[] } }>)['pages']!.config
    config.fields = [...pageFields, { name: 'body', type: 'richText' }]
    deps.collections['pages'] = { fields: ['title', 'body'] }
    const tool = createDescribeContentTypeTool(deps)
    const plain = (await tool.handler({ collection: 'pages' }, editor)) as { fields: { name: string; accepts?: string[] }[] }
    expect(plain.fields.find((f) => f.name === 'body')?.accepts).toEqual(['an editor state ({ root: … })'])

    deps.collections['pages'] = { fields: ['title', 'body'], richText: { body: async () => ({ state: {} }) } }
    const converted = (await tool.handler({ collection: 'pages' }, editor)) as typeof plain
    expect(converted.fields.find((f) => f.name === 'body')?.accepts).toEqual([
      '{ markdown: "…" }',
      '{ html: "…" }',
      'an editor state ({ root: … })',
    ])
  })

  it('refuses a collection the site did not hand to the tools, and names the ones it did', async () => {
    const { deps } = makeDeps()
    const out = await createDescribeContentTypeTool(deps).handler({ collection: 'users' }, editor)
    expect(out).toEqual({ error: expect.stringMatching(/"users".*pages/) })
  })
})

describe('find_documents', () => {
  it('searches title and slug as the caller, drafts included, without overriding access', async () => {
    const { deps, find } = makeDeps()
    const out = await createFindDocumentsTool(deps).handler({ collection: 'pages', query: ' abo ' }, editor)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        where: { or: [{ title: { like: 'abo' } }, { slug: { like: 'abo' } }] },
        draft: true,
        overrideAccess: false,
        user: editor.user,
      }),
    )
    expect(out).toEqual({
      collection: 'pages',
      query: 'abo',
      results: [
        {
          id: 7,
          title: 'About us',
          slug: 'about',
          status: 'draft',
          updatedAt: '2026-10-01T00:00:00.000Z',
          adminUrl: '/admin/collections/pages/7',
          previewUrl: 'https://site.test/next/preview?slug=about',
          rank: 1,
        },
      ],
    })
  })

  it('lists the most recently changed when there is no query', async () => {
    const { deps, find } = makeDeps()
    await createFindDocumentsTool(deps).handler({ collection: 'pages' }, editor)
    expect(find.mock.calls[0]![0]).not.toHaveProperty('where')
    expect(find.mock.calls[0]![0]).toMatchObject({ sort: '-updatedAt', limit: 10 })
  })
})

describe('find_related', () => {
  it('finds by name, as the caller', async () => {
    const find = vi.fn(async () => ({ docs: [{ id: 3, name: 'Jane Doe', email: 'j@x.test' }] }))
    const { deps } = makeDeps({ find })
    const out = await createFindRelatedTool(deps).handler({ kind: 'people', query: 'jane' }, editor)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'people',
        where: { and: [{ name: { like: 'jane' } }] },
        overrideAccess: false,
      }),
    )
    // Only the name: nothing else about the person.
    expect(out).toEqual({ kind: 'people', collection: 'people', results: [{ id: 3, title: 'Jane Doe', rank: 1 }] })
  })

  it('gives an image its alt text and dimensions', async () => {
    const find = vi.fn(async () => ({
      docs: [{ id: 9, alt: 'A team at work', width: 1600, height: 900, filename: 'team.jpg', mimeType: 'image/jpeg', prefix: 'x' }],
    }))
    const { deps } = makeDeps({ find })
    const out = (await createFindRelatedTool(deps).handler({ kind: 'media' }, editor)) as { results: unknown[] }
    expect(out.results[0]).toEqual({
      id: 9,
      title: 'A team at work',
      alt: 'A team at work',
      width: 1600,
      height: 900,
      filename: 'team.jpg',
      mimeType: 'image/jpeg',
    })
  })

  it('matches every search field the kind names, so an image is found by its alt text', async () => {
    const find = vi.fn(async () => ({ docs: [] }))
    const { deps } = makeDeps({ find })
    await createFindRelatedTool(deps).handler({ kind: 'media', query: 'team' }, editor)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { and: [{ or: [{ alt: { like: 'team' } }, { filename: { like: 'team' } }] }] },
      }),
    )
  })

  it('filters exactly on the fields the kind allows, and refuses any other', async () => {
    const find = vi.fn(async () => ({ docs: [{ id: 4, name: 'Accessibility', type: 'topic' }] }))
    const { deps } = makeDeps({ find })
    const tool = createFindRelatedTool(deps)
    const out = await tool.handler({ kind: 'topics', where: { type: 'topic' } }, editor)
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { and: [{ type: { equals: 'topic' } }] } }))
    expect(out).toMatchObject({ results: [{ id: 4, title: 'Accessibility', type: 'topic' }] })

    find.mockClear()
    const refused = await tool.handler({ kind: 'topics', where: { secret: 'x' } }, editor)
    expect(refused).toEqual({ error: expect.stringMatching(/cannot be filtered by secret/) })
    expect(find).not.toHaveBeenCalled()
  })

  it('names the kinds when asked for one that does not exist', async () => {
    const { deps } = makeDeps()
    const out = await createFindRelatedTool(deps).handler({ kind: 'users' }, editor)
    expect(out).toEqual({ error: 'There is no kind "users". Kinds: people, media, topics.' })
  })
})

describe('get_document', () => {
  it('returns the latest draft in the write shape: authored fields only, blocks with their ids', async () => {
    const { deps, findByID } = makeDeps()
    const out = await createGetDocumentTool(deps).handler({ collection: 'pages', id: 7 }, editor)
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, draft: true, depth: 0, overrideAccess: false }),
    )
    expect(out).toEqual({
      collection: 'pages',
      id: 7,
      status: 'draft',
      updatedAt: '2026-10-01T00:00:00.000Z',
      adminUrl: '/admin/collections/pages/7',
      previewUrl: 'https://site.test/next/preview?slug=about',
      data: { title: 'About us', layout: [{ id: 'b1', blockType: 'Quote' }], slug: 'about' },
    })
  })

  it('reads the published version when asked', async () => {
    const { deps, findByID } = makeDeps()
    await createGetDocumentTool(deps).handler({ collection: 'pages', id: 7, draft: false }, editor)
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ draft: false }))
  })

  it('says so when there is nothing the caller can read, without saying whether it exists', async () => {
    const { deps } = makeDeps({ findByID: vi.fn(async () => null) })
    const out = await createGetDocumentTool(deps).handler({ collection: 'pages', id: 99 }, editor)
    expect(out).toEqual({ error: 'No pages document 99 that you can read.' })
  })
})

describe('toWriteShape', () => {
  it('keeps the named fields that are present, and nothing else', () => {
    expect(toWriteShape({ a: 1, b: undefined, c: 3 }, ['a', 'b'])).toEqual({ a: 1 })
  })
})

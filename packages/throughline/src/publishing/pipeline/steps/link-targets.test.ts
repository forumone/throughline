import type { Block, CollectionConfig, Field, Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { markLinkTarget } from '../../../references/links.js'
import { attachComponentValidator, makeContext } from '../_test-helpers.js'
import { runPublishPipeline } from '../index.js'
import { linkTargetsStep } from './link-targets.js'

/*
The `link-targets` step against a stubbed Payload (forumone-2026#756): which
targets block, which warn, which pass, and what the editor is told.
*/

const link = (name: string, label?: string): Field => ({
  name,
  type: 'group',
  ...(label ? { label } : {}),
  fields: [
    { name: 'mode', type: 'radio', options: ['internal', 'external'] },
    markLinkTarget({
      name: 'reference',
      type: 'relationship',
      relationTo: ['pages', 'case-studies', 'tags'],
    }),
    { name: 'url', type: 'text' },
  ],
})

const CardGrid: Block = {
  slug: 'CardGrid',
  labels: { singular: 'Card Grid', plural: 'Card Grids' },
  fields: [{ name: 'items', type: 'array', fields: [link('href')] }],
}

const pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  admin: { useAsTitle: 'title' },
  versions: { drafts: true },
  trash: true,
  fields: [
    { name: 'title', type: 'text' },
    link('primary', 'Primary link'),
    { name: 'layout', type: 'blocks', blocks: [CardGrid] },
    { name: 'body', type: 'richText', label: 'Body' },
  ],
}

const caseStudies: CollectionConfig = {
  slug: 'case-studies',
  labels: { singular: 'Case Study', plural: 'Case Studies' },
  admin: { useAsTitle: 'title' },
  versions: { drafts: true },
  trash: true,
  fields: [{ name: 'title', type: 'text' }],
}

// No drafts: everything that exists is published.
const tags: CollectionConfig = {
  slug: 'tags',
  labels: { singular: 'Tag', plural: 'Tags' },
  admin: { useAsTitle: 'name' },
  fields: [{ name: 'name', type: 'text' }],
}

type Row = Record<string, unknown>

/**
 * A Payload that holds `live` rows (the main table) and `latest` rows (the
 * newest draft) per collection, and answers `find` and `findByID` from them.
 */
function stubPayload(opts: {
  document: Row
  live: Record<string, Row[]>
  latest?: Record<string, Row[]>
}) {
  const configs: Record<string, CollectionConfig> = { pages, 'case-studies': caseStudies, tags }
  const find = vi.fn(
    async (args: {
      collection: string
      where: { id: { in: unknown[] } }
      draft?: boolean
      trash?: boolean
    }) => {
      const ids = args.where.id.in.map(String)
      const source = args.draft ? (opts.latest ?? {}) : opts.live
      const docs = (source[args.collection] ?? []).filter(
        (row) => ids.includes(String(row['id'])) && (args.trash || args.draft || !row['deletedAt']),
      )
      return { docs }
    },
  )
  const findByID = vi.fn(async () => opts.document)
  const payload = {
    collections: Object.fromEntries(
      Object.entries(configs).map(([slug, config]) => [slug, { config }]),
    ),
    config: { blocks: [] },
    find,
    findByID,
    logger: { error: vi.fn() },
  } as unknown as Payload
  return { payload, find, findByID }
}

const cardLink = (relationTo: string, value: unknown) => ({
  blockType: 'CardGrid',
  items: [{ href: { mode: 'internal', reference: { relationTo, value } } }],
})

function contextFor(document: Row, live: Record<string, Row[]>, latest?: Record<string, Row[]>) {
  const stub = stubPayload({ document, live, ...(latest ? { latest } : {}) })
  const ctx = makeContext({
    payload: stub.payload,
    document,
    options: {
      collections: [{ slug: 'pages' }, { slug: 'case-studies' }],
      inngest: {} as never,
    },
  })
  return { ctx, ...stub }
}

describe('the verdicts', () => {
  it('passes a link to a published page', async () => {
    const document = { id: 'p1', layout: [{ blockType: 'Text' }, cardLink('pages', 2)] }
    const { ctx } = contextFor(document, {
      pages: [{ id: 2, title: 'About', _status: 'published' }],
    })
    expect(await linkTargetsStep(ctx)).toEqual({ pass: true })
  })

  it('passes a link to a collection without drafts', async () => {
    const document = { id: 'p1', layout: [cardLink('tags', 5)] }
    const { ctx } = contextFor(document, { tags: [{ id: 5, name: 'Design' }] })
    expect(await linkTargetsStep(ctx)).toEqual({ pass: true })
  })

  it('refuses a link to a draft, naming it and the block it is in', async () => {
    const document = {
      id: 'p1',
      layout: [{ blockType: 'Unknown' }, { blockType: 'Unknown' }, cardLink('pages', 2)],
    }
    const { ctx } = contextFor(document, {
      pages: [{ id: 2, title: 'Annual report', _status: 'draft' }],
    })
    const result = await linkTargetsStep(ctx)
    expect(result.pass).toBe(false)
    expect(result.code).toBe('link-targets')
    expect(result.reason).toBe("1 link goes to a page readers can't see.")
    expect(result.issues).toEqual([
      {
        field: 'layout[2].items[0].href.reference',
        where: 'Block 3 (Card Grid)',
        message:
          'This link goes to "Annual report", which is a draft, so readers would get a page that doesn\'t exist. Publish "Annual report" first, or change the link.',
        severity: 'error',
        rule: 'draft',
      },
    ])
  })

  it('refuses a link to a page in the trash', async () => {
    const document = { id: 'p1', primary: { reference: { relationTo: 'pages', value: 3 } } }
    const { ctx } = contextFor(document, {
      pages: [
        { id: 3, title: 'Old news', _status: 'published', deletedAt: '2026-10-01T00:00:00Z' },
      ],
    })
    const result = await linkTargetsStep(ctx)
    expect(result.issues?.[0]?.message).toBe(
      'This link goes to "Old news", which is in the trash. Restore it, or change the link.',
    )
    expect(result.issues?.[0]?.where).toBe('Primary link')
    expect(result.issues?.[0]?.field).toBe('primary.reference')
  })

  it('refuses a link to a deleted document, naming the collection by its label', async () => {
    const document = { id: 'p1', layout: [cardLink('case-studies', 99)] }
    const { ctx } = contextFor(document, { 'case-studies': [] })
    const result = await linkTargetsStep(ctx)
    expect(result.issues?.[0]?.message).toBe(
      'This link goes to a Case Study that has been deleted. Change the link.',
    )
    expect(result.issues?.[0]?.where).toBe('Block 1 (Card Grid)')
    expect(result.issues?.[0]?.rule).toBe('deleted')
  })

  it('warns, and does not block, when an unpublished target is scheduled', async () => {
    const document = { id: 'p1', layout: [cardLink('case-studies', 4)] }
    const { ctx } = contextFor(
      document,
      { 'case-studies': [{ id: 4, title: 'Launch', _status: 'draft' }] },
      { 'case-studies': [{ id: 4, title: 'Launch', scheduledPublishAt: '2026-10-06T09:00:00Z' }] },
    )
    const result = await linkTargetsStep(ctx)
    expect(result.pass).toBe(true)
    expect(result.warnings).toEqual([
      'A link in block 1 (Card Grid) goes to "Launch", which isn\'t published yet but is scheduled to be. Until it goes live, readers who follow the link will get a page that doesn\'t exist.',
    ])
  })

  it('takes the title from the latest draft, which is what the editor sees', async () => {
    const document = { id: 'p1', layout: [cardLink('pages', 2)] }
    const { ctx } = contextFor(
      document,
      { pages: [{ id: 2, title: 'Old title', _status: 'draft' }] },
      { pages: [{ id: 2, title: 'New title' }] },
    )
    const result = await linkTargetsStep(ctx)
    expect(result.issues?.[0]?.message).toContain('"New title", which is a draft')
  })
})

describe('reading', () => {
  it('reads the document unpopulated, and each collection once', async () => {
    const document = {
      id: 'p1',
      layout: [
        cardLink('pages', 2),
        cardLink('pages', 3),
        cardLink('pages', 2),
        cardLink('tags', 1),
      ],
    }
    const { ctx, find, findByID } = contextFor(document, {
      pages: [
        { id: 2, title: 'A', _status: 'published' },
        { id: 3, title: 'B', _status: 'published' },
      ],
      tags: [{ id: 1, name: 'T' }],
    })
    await linkTargetsStep(ctx)
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ depth: 0, draft: true }))
    expect(find).toHaveBeenCalledTimes(2)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        where: { id: { in: [2, 3] } },
        draft: false,
        trash: true,
        depth: 0,
        overrideAccess: true,
        limit: 2,
        select: { title: true, _status: true, deletedAt: true },
      }),
    )
    expect(find).toHaveBeenCalledWith(
      expect.not.objectContaining({ trash: true, collection: 'tags' }),
    )
  })

  it('finds an internal link in rich text', async () => {
    const body = {
      root: {
        children: [
          {
            type: 'link',
            fields: { linkType: 'internal', doc: { relationTo: 'pages', value: 2 } },
            children: [],
          },
        ],
      },
    }
    const { ctx } = contextFor({ id: 'p1', body }, { pages: [] })
    const result = await linkTargetsStep(ctx)
    expect(result.issues?.[0]).toMatchObject({
      field: 'body',
      where: 'Body',
      message: 'This link goes to a Page that has been deleted. Change the link.',
    })
  })

  it('skips a link back to the document being published', async () => {
    const document = { id: 'p1', layout: [cardLink('pages', 'p1')] }
    const { ctx, find } = contextFor(document, { pages: [{ id: 'p1', _status: 'draft' }] })
    expect(await linkTargetsStep(ctx)).toEqual({ pass: true })
    expect(find).not.toHaveBeenCalled()
  })

  it('ignores a stale reference behind an external link', async () => {
    const document = {
      id: 'p1',
      primary: {
        mode: 'external',
        url: 'https://example.com',
        reference: { relationTo: 'pages', value: 2 },
      },
    }
    const { ctx, find } = contextFor(document, { pages: [] })
    expect(await linkTargetsStep(ctx)).toEqual({ pass: true })
    expect(find).not.toHaveBeenCalled()
  })

  it('counts several broken links in the reason', async () => {
    const document = { id: 'p1', layout: [cardLink('pages', 8), cardLink('pages', 9)] }
    const { ctx } = contextFor(document, { pages: [] })
    const result = await linkTargetsStep(ctx)
    expect(result.reason).toBe("2 links go to pages readers can't see.")
    expect(result.issues).toHaveLength(2)
  })

  it('refuses rather than passing when the targets cannot be read', async () => {
    const document = { id: 'p1', layout: [cardLink('pages', 2)] }
    const { ctx, find } = contextFor(document, { pages: [] })
    find.mockRejectedValueOnce(new Error('connection lost'))
    const result = await linkTargetsStep(ctx)
    expect(result.pass).toBe(false)
    expect(result.code).toBe('link-targets')
    expect(result.reason).toContain('tell a site administrator')
  })
})

describe('switching it off', () => {
  it('passes without reading when linkTargets.enabled is false', async () => {
    const document = { id: 'p1', layout: [cardLink('pages', 2)] }
    const { ctx, findByID } = contextFor(document, { pages: [] })
    ctx.options = { ...ctx.options, linkTargets: { enabled: false } }
    expect(await linkTargetsStep(ctx)).toEqual({ pass: true })
    expect(findByID).not.toHaveBeenCalled()
  })

  it('passes when Payload has no config for the collection, as in the other steps’ stubs', async () => {
    expect(await linkTargetsStep(makeContext())).toEqual({ pass: true })
  })
})

describe('in the pipeline', () => {
  it('blocks a publish at link-targets, carrying a scheduled target’s warning', async () => {
    const document = {
      id: 'p1',
      slug: 'home',
      seo: { title: 'Home', description: 'The home page' },
      layout: [cardLink('pages', 2), cardLink('case-studies', 4)],
    }
    const { ctx } = contextFor(
      document,
      { pages: [], 'case-studies': [{ id: 4, title: 'Launch', _status: 'draft' }] },
      { 'case-studies': [{ id: 4, title: 'Launch', scheduledPublishAt: '2026-10-06T09:00:00Z' }] },
    )
    attachComponentValidator(ctx.payload, async () => ({ valid: true, issues: [] }))
    const result = await runPublishPipeline(ctx)
    expect(result.success).toBe(false)
    expect(result.failedAt).toBe('link-targets')
    expect(result.warnings).toHaveLength(1)
  })
})

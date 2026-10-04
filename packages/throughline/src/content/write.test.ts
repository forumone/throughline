import { ValidationError, type Field, type Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { anonymousContext, fakeContext } from '../publishing/tools/_test-helpers.js'
import { COMPONENTS_VALIDATOR_SYMBOL } from '../publishing/pipeline/steps/composition.js'
import type { McpToolContext } from '../plugin-contract/index.js'
import { createCreateDraftTool, createUpdateDraftTool, type ContentWriteDeps } from './write.js'

vi.mock('payload', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  createLocalReq: async ({ user }: { user?: unknown }) => ({ user }),
}))

/*
A page collection with the shape that matters: a slug, an SEO group, a blocks
field narrowed by filterOptions, and a policy group that must stay out of reach.
*/
const fields: Field[] = [
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
            blocks: [
              { slug: 'Quote', fields: [] },
              { slug: 'Hero', fields: [] },
              { slug: 'EventHero', fields: [] },
            ],
            filterOptions: ({ siblingData }) => [
              'Quote',
              'Hero',
              ...((siblingData as { layout?: { blockType: string }[] }).layout ?? []).map(
                (r) => r.blockType,
              ),
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'meta',
    type: 'group',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'description', type: 'textarea' },
    ],
  },
  { name: 'slug', type: 'text' },
  { name: 'policy', type: 'group', fields: [{ name: 'requiresApproval', type: 'checkbox' }] },
]

const existing = {
  id: 7,
  title: 'About',
  slug: 'about',
  _status: 'published',
  meta: { title: 'About us', description: 'Who we are' },
  layout: [{ id: 'b1', blockType: 'Quote' }],
}

interface Setup {
  slugHolders?: Record<string, Record<string, unknown>>
  lock?: Record<string, unknown>
  current?: Record<string, unknown> | null
  validator?: ReturnType<typeof vi.fn>
  create?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
}

function setup(options: Setup = {}) {
  const find = vi.fn(async (args: { collection: string; where: Record<string, unknown> }) => {
    if (args.collection === 'payload-locked-documents') {
      return { docs: options.lock ? [options.lock] : [] }
    }
    const wanted = (args.where as { slug?: { equals?: string } }).slug?.equals
    const holder = wanted ? options.slugHolders?.[wanted] : undefined
    return { docs: holder ? [holder] : [] }
  })
  const findByID = vi.fn(async () => (options.current === undefined ? existing : options.current))
  const create =
    options.create ?? vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 12, _status: 'draft', ...data }))
  const update =
    options.update ??
    vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...existing, ...data, _status: 'draft' }))
  const audit = vi.fn(async () => {})
  const validator = options.validator ?? vi.fn(async () => ({ issues: [] }))

  const payload = {
    find,
    findByID,
    create,
    update,
    [COMPONENTS_VALIDATOR_SYMBOL]: validator,
    config: { routes: { admin: '/admin' }, serverURL: 'https://site.test', blocks: [] },
    collections: {
      pages: {
        config: {
          slug: 'pages',
          labels: { singular: 'Page' },
          admin: { useAsTitle: 'title', preview: (doc: { slug?: string }) => `/preview/${doc.slug}` },
          versions: { drafts: true },
          trash: true,
          fields,
        },
      },
      'payload-locked-documents': { config: {} },
    },
  } as unknown as Payload

  const deps: ContentWriteDeps = {
    payload,
    collections: { pages: { fields: ['title', 'slug', 'layout', 'meta'] } },
    related: {},
    audit,
  }
  return { deps, find, findByID, create, update, audit, validator }
}

const editor: McpToolContext = {
  ...fakeContext,
  user: { ...fakeContext.user!, id: '9', name: 'Ed Itor', roles: ['editor'] },
  apiKeyName: 'ed-desktop',
}
const meta = {
  userPrompt: 'Draft an about page',
  reasoning: 'The editor asked for one',
  changesSummary: 'New about page',
}

describe('create_draft', () => {
  it('creates a draft as the caller, never published, and returns its links', async () => {
    const { deps, create } = setup()
    const out = await createCreateDraftTool(deps).handler(
      { collection: 'pages', data: { title: 'Our Work', layout: [{ blockType: 'Quote' }] } },
      editor,
    )
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        draft: true,
        overrideAccess: false,
        user: editor.user,
        data: { title: 'Our Work', layout: [{ blockType: 'Quote' }], slug: 'our-work' },
      }),
    )
    expect(out).toEqual({
      collection: 'pages',
      id: 12,
      status: 'draft',
      slug: 'our-work',
      adminUrl: '/admin/collections/pages/12',
      previewUrl: 'https://site.test/preview/our-work',
      next: expect.stringMatching(/get_publish_status/),
    })
  })

  it.each([
    ['_status', { _status: 'published' }, /always drafts/],
    ['narration', { narration: { url: 'x' } }, /Generated/],
    ['policy, which would lower an approval requirement', { policy: { requiresApproval: false } }, /approval policy/],
  ])('refuses %s before saving anything', async (_, extra, reason) => {
    const { deps, create } = setup()
    const out = (await createCreateDraftTool(deps).handler(
      { collection: 'pages', data: { title: 'X', ...extra } },
      editor,
    )) as { error: string; refused: { reason: string }[] }
    expect(out.error).toMatch(/^Cannot set/)
    expect(out.refused[0]!.reason).toMatch(reason)
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a slug that is taken, including by a document in the trash, and offers a free one', async () => {
    const { deps, create } = setup({
      slugHolders: { 'our-work': { id: 3, title: 'Old work', deletedAt: '2026-09-01' } },
    })
    const out = await createCreateDraftTool(deps).handler(
      { collection: 'pages', data: { title: 'Our Work' } },
      editor,
    )
    expect(out).toEqual({
      error: 'The slug "our-work" is taken by "Old work", which is in the trash.',
      takenBy: { id: 3, title: 'Old work', trashed: true },
      suggestion: 'our-work-2',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a block the field does not offer — a page has no Event Hero', async () => {
    const { deps, create } = setup()
    const out = await createCreateDraftTool(deps).handler(
      { collection: 'pages', data: { title: 'X', layout: [{ blockType: 'EventHero' }] } },
      editor,
    )
    expect(out).toMatchObject({
      error: expect.stringMatching(/layout does not accept EventHero/),
      disallowed: ['EventHero'],
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a layout that breaks a composition rule, saying which', async () => {
    const validator = vi.fn(async () => ({
      issues: [{ severity: 'error', rule: 'max-per-page', message: 'Hero may appear once', blockIndex: 1 }],
    }))
    const { deps, create } = setup({ validator })
    const out = await createCreateDraftTool(deps).handler(
      { collection: 'pages', data: { title: 'X', layout: [{ blockType: 'Hero' }, { blockType: 'Hero' }] } },
      editor,
    )
    expect(out).toEqual({
      error: 'layout breaks 1 composition rule. Nothing was saved.',
      field: 'layout',
      issues: [{ rule: 'max-per-page', message: 'Hero may appear once', index: 1 }],
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a key with nobody behind it before anything else', async () => {
    const { deps, find, create } = setup()
    const out = await createCreateDraftTool(deps).handler({ collection: 'pages', data: { title: 'X' } }, anonymousContext)
    expect(out).toEqual({ error: expect.any(String) })
    expect(find).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("records the write in the audit log as the person, with the caller's _meta", async () => {
    const { deps, audit } = setup()
    await createCreateDraftTool(deps).handler(
      { collection: 'pages', data: { title: 'Our Work' }, _meta: meta },
      editor,
    )
    expect(audit).toHaveBeenCalledWith({
      actor: { type: 'user', userId: '9', userName: 'Ed Itor', apiKeyName: 'ed-desktop', sessionId: undefined },
      action: 'content.create',
      mcpServer: 'content',
      mcpTool: 'create_draft',
      targetCollection: 'pages',
      targetId: '12',
      targetTitle: 'Our Work',
      prompt: 'Draft an about page',
      reasoning: 'The editor asked for one',
      changesSummary: 'New about page',
    })
  })

  it("hands back Payload's own refusal as something to act on", async () => {
    const create = vi.fn(async () => {
      throw new ValidationError({ errors: [{ path: 'title', message: 'This field is required.' }] })
    })
    const { deps } = setup({ create })
    const out = await createCreateDraftTool(deps).handler({ collection: 'pages', data: { slug: 'x' } }, editor)
    expect(out).toMatchObject({ fields: [{ field: 'title', message: 'This field is required.' }] })
  })
})

describe('update_draft', () => {
  it('merges a group, keeps the rest, and saves a draft that respects locks', async () => {
    const { deps, update } = setup()
    const out = await createUpdateDraftTool(deps).handler(
      { collection: 'pages', id: 7, patch: { meta: { title: 'About Forum One' } } },
      editor,
    )
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 7,
        draft: true,
        overrideAccess: false,
        overrideLock: false,
        data: { meta: { title: 'About Forum One', description: 'Who we are' } },
      }),
    )
    expect(out).toMatchObject({ id: 7, status: 'draft', changed: ['meta'] })
  })

  it('refuses while somebody has the document open, and names them', async () => {
    const { deps, update, findByID } = setup({
      lock: { updatedAt: new Date().toISOString(), user: { value: { id: 4, name: 'Jane Editor' } } },
    })
    const out = await createUpdateDraftTool(deps).handler(
      { collection: 'pages', id: 7, patch: { title: 'New' } },
      editor,
    )
    expect(out).toMatchObject({
      error: expect.stringMatching(/^Jane Editor has pages 7 open in the admin/),
      lockedBy: 'Jane Editor',
    })
    expect(findByID).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps a block the document already holds when the layout is resent', async () => {
    const { deps, update } = setup({
      current: { ...existing, layout: [{ id: 'b1', blockType: 'EventHero' }] },
    })
    const out = await createUpdateDraftTool(deps).handler(
      { collection: 'pages', id: 7, patch: { layout: [{ id: 'b1', blockType: 'EventHero' }, { blockType: 'Quote' }] } },
      editor,
    )
    expect(out).not.toHaveProperty('error')
    expect(update).toHaveBeenCalled()
  })

  it('checks a changed slug, and leaves an unchanged one alone', async () => {
    const { deps, find } = setup({ slugHolders: { taken: { id: 2, title: 'Taken' } } })
    const tool = createUpdateDraftTool(deps)
    await expect(tool.handler({ collection: 'pages', id: 7, patch: { slug: 'Taken' } }, editor)).resolves.toMatchObject({
      error: 'The slug "taken" is taken by "Taken".',
    })
    find.mockClear()
    await tool.handler({ collection: 'pages', id: 7, patch: { slug: 'about' } }, editor)
    expect(find.mock.calls.filter(([args]) => args.collection === 'pages')).toEqual([])
  })

  it('refuses an empty patch and a refused field', async () => {
    const { deps } = setup()
    const tool = createUpdateDraftTool(deps)
    await expect(tool.handler({ collection: 'pages', id: 7, patch: {} }, editor)).resolves.toEqual({
      error: 'The patch sets nothing.',
    })
    await expect(
      tool.handler({ collection: 'pages', id: 7, patch: { _status: 'published' } }, editor),
    ).resolves.toMatchObject({ error: 'Cannot set _status.' })
  })

  it('says so when there is nothing the caller can read', async () => {
    const { deps, update } = setup({ current: null })
    const out = await createUpdateDraftTool(deps).handler({ collection: 'pages', id: 99, patch: { title: 'X' } }, editor)
    expect(out).toEqual({ error: 'No pages document 99 that you can read.' })
    expect(update).not.toHaveBeenCalled()
  })

  it('records what changed, with _meta, as content.update', async () => {
    const { deps, audit } = setup()
    await createUpdateDraftTool(deps).handler(
      { collection: 'pages', id: 7, patch: { title: 'New' }, _meta: { userPrompt: 'Retitle it' } },
      editor,
    )
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'content.update',
        mcpTool: 'update_draft',
        targetId: '7',
        prompt: 'Retitle it',
        changesSummary: 'Set title.',
      }),
    )
  })
})

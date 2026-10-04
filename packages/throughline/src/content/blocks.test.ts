import type { Block, Field, Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { fakeContext } from '../publishing/tools/_test-helpers.js'
import { COMPONENTS_VALIDATOR_SYMBOL } from '../publishing/pipeline/steps/composition.js'
import type { McpToolContext } from '../plugin-contract/index.js'
import {
  blockFieldPaths,
  createEditBlocksTool,
  createInsertBlockTool,
  createMoveBlockTool,
  createRemoveBlockTool,
  createUpdateBlockTool,
  newBlockId,
} from './blocks.js'
import type { ContentWriteDeps } from './write.js'

vi.mock('payload', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  createLocalReq: async ({ user }: { user?: unknown }) => ({ user }),
}))

const required = (value: unknown) =>
  value === undefined || value === '' ? 'This field is required.' : true

const quote: Block = {
  slug: 'Quote',
  fields: [
    { name: 'text', type: 'text', validate: required as never },
    { name: 'source', type: 'group', fields: [{ name: 'name', type: 'text' }, { name: 'role', type: 'text' }] },
  ],
}
const cta: Block = { slug: 'Cta', fields: [{ name: 'label', type: 'text' }] }
const eventHero: Block = { slug: 'EventHero', fields: [] }

const blocksField = (name: string): Field => ({
  name,
  type: 'blocks',
  blocks: [quote, cta, eventHero],
  filterOptions: ({ siblingData }) => [
    'Quote',
    'Cta',
    ...(((siblingData as Record<string, { blockType: string }[] | undefined>)[name]) ?? []).map(
      (r) => r.blockType,
    ),
  ],
})

const fields: Field[] = [
  { name: 'title', type: 'text' },
  blocksField('layout'),
  { name: 'approach', type: 'group', fields: [{ name: 'heading', type: 'text' }, blocksField('blocks')] },
  { name: 'tags', type: 'array', fields: [{ name: 'tag', type: 'text' }] },
]

const doc = () => ({
  id: 7,
  title: 'Case',
  _status: 'draft',
  layout: [
    { id: 'a', blockType: 'Quote', text: 'One', source: { name: 'Ann', role: 'CEO' } },
    { id: 'b', blockType: 'Cta', label: 'Go' },
    { id: 'c', blockType: 'Quote', text: 'Three' },
  ],
  approach: { heading: 'How', blocks: [{ id: 'x', blockType: 'Cta', label: 'Ask' }] },
})

function setup(options: { lock?: unknown; validator?: ReturnType<typeof vi.fn> } = {}) {
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...doc(), ...data }))
  const audit = vi.fn(async () => {})
  const payload = {
    find: vi.fn(async () => ({ docs: options.lock ? [options.lock] : [] })),
    findByID: vi.fn(async () => doc()),
    update,
    [COMPONENTS_VALIDATOR_SYMBOL]: options.validator ?? vi.fn(async () => ({ issues: [] })),
    config: { routes: { admin: '/admin' }, serverURL: '', blocks: [] },
    collections: {
      'case-studies': {
        config: { slug: 'case-studies', admin: { useAsTitle: 'title' }, versions: { drafts: true }, fields },
      },
      'payload-locked-documents': { config: {} },
    },
  } as unknown as Payload
  const deps: ContentWriteDeps = {
    payload,
    collections: { 'case-studies': { fields: ['title', 'layout', 'approach', 'tags'] } },
    related: {},
    audit,
  }
  return { deps, update, audit }
}

const editor: McpToolContext = { ...fakeContext, user: { ...fakeContext.user!, roles: ['editor'] } }
const at = { collection: 'case-studies', id: 7 }

type Row = { id?: string; blockType?: string; [field: string]: unknown }
type Saved = { layout: Row[]; approach: { heading?: string; blocks: Row[] } }
const savedRows = (update: ReturnType<typeof vi.fn>, path = 'layout'): Row[] => {
  const data = update.mock.calls[0]![0].data as Saved
  return path === 'layout' ? data.layout : data.approach.blocks
}

describe('blockFieldPaths', () => {
  it('names a top-level blocks field, and one inside a group by its path', () => {
    expect([...blockFieldPaths(fields).keys()]).toEqual(['layout', 'approach.blocks'])
  })
})

describe('newBlockId', () => {
  it('is 24 hex characters, as Payload’s own are', () => {
    expect(newBlockId()).toMatch(/^[0-9a-f]{24}$/)
  })
})

describe('insert_block', () => {
  const tool = (deps: ContentWriteDeps) => createInsertBlockTool(deps)

  it('adds at the end by default, with a fresh id, and returns it', async () => {
    const { deps, update } = setup()
    const out = await tool(deps).handler({ ...at, field: 'layout', block: { blockType: 'Cta', label: 'New' } }, editor)
    const rows = savedRows(update)
    expect(rows.map((r: Row) => r.id).slice(0, 3)).toEqual(['a', 'b', 'c'])
    expect(rows[3]).toMatchObject({ blockType: 'Cta', label: 'New', id: expect.stringMatching(/^[0-9a-f]{24}$/) })
    expect(out).toMatchObject({ field: 'layout', blockId: rows[3].id, status: 'draft' })
    expect(update.mock.calls[0]![0]).toMatchObject({ draft: true, overrideLock: false, overrideAccess: false })
  })

  it('adds at the start, or after a given block, and ignores an id the caller sent', async () => {
    let s = setup()
    await tool(s.deps).handler({ ...at, field: 'layout', block: { blockType: 'Cta', id: 'mine' }, position: 'start' }, editor)
    expect(savedRows(s.update)[0]).toMatchObject({ blockType: 'Cta' })
    expect(savedRows(s.update)[0].id).not.toBe('mine')

    s = setup()
    await tool(s.deps).handler({ ...at, field: 'layout', block: { blockType: 'Cta' }, after: 'a' }, editor)
    expect(savedRows(s.update).map((r: Row) => r.blockType)).toEqual(['Quote', 'Cta', 'Cta', 'Quote'])
  })

  it('inserts into a blocks field inside a group, keeping the group’s other fields', async () => {
    const { deps, update } = setup()
    await tool(deps).handler({ ...at, field: 'approach.blocks', block: { blockType: 'Quote', text: 'Q' } }, editor)
    const data = update.mock.calls[0]![0].data as Saved
    expect(data).toEqual({
      approach: { heading: 'How', blocks: [expect.objectContaining({ id: 'x' }), expect.objectContaining({ blockType: 'Quote', text: 'Q' })] },
    })
  })

  it('refuses a block the field does not offer', async () => {
    const { deps, update } = setup()
    const out = await tool(deps).handler({ ...at, field: 'layout', block: { blockType: 'EventHero' } }, editor)
    expect(out).toMatchObject({ error: expect.stringMatching(/does not accept EventHero/) })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a block that fails its own validation, saying where', async () => {
    const { deps, update } = setup()
    const out = await tool(deps).handler({ ...at, field: 'layout', block: { blockType: 'Quote' } }, editor)
    expect(out).toEqual({
      error: 'The Quote block is not valid. Nothing was saved.',
      problems: [{ path: 'text', message: 'This field is required.' }],
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a field that is not a blocks field the author may change', async () => {
    const { deps } = setup()
    const out = await tool(deps).handler({ ...at, field: 'tags', block: { blockType: 'Cta' } }, editor)
    expect(out).toEqual({ error: expect.stringMatching(/"tags" is not a blocks field.*layout, approach\.blocks/) })
  })

  it('refuses "after" a block that is not there', async () => {
    const { deps, update } = setup()
    const out = await tool(deps).handler({ ...at, field: 'layout', block: { blockType: 'Cta' }, after: 'zz' }, editor)
    expect(out).toEqual({ error: expect.stringMatching(/no block "zz" in layout/) })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a document somebody has open', async () => {
    const { deps, update } = setup({
      lock: { updatedAt: new Date().toISOString(), user: { value: { id: 4, name: 'Jane' } } },
    })
    const out = await tool(deps).handler({ ...at, field: 'layout', block: { blockType: 'Cta' } }, editor)
    expect(out).toMatchObject({ lockedBy: 'Jane' })
    expect(update).not.toHaveBeenCalled()
  })

  it('records what it did, in words, when the caller gave no summary', async () => {
    const { deps, audit } = setup()
    await tool(deps).handler({ ...at, field: 'layout', block: { blockType: 'Cta' } }, editor)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'content.update',
        mcpTool: 'insert_block',
        changesSummary: 'Inserted a Cta block into layout.',
      }),
    )
  })
})

describe('update_block', () => {
  it('changes one block, merging a group inside it', async () => {
    const { deps, update } = setup()
    const out = await createUpdateBlockTool(deps).handler(
      { ...at, field: 'layout', blockId: 'a', patch: { source: { role: 'Founder' } } },
      editor,
    )
    expect(savedRows(update)[0]).toEqual({
      id: 'a',
      blockType: 'Quote',
      text: 'One',
      source: { name: 'Ann', role: 'Founder' },
    })
    expect(savedRows(update)[1]).toEqual({ id: 'b', blockType: 'Cta', label: 'Go' })
    expect(out).toMatchObject({ blockId: 'a' })
  })

  it('checks the changed block whole, so a change cannot leave it invalid', async () => {
    const { deps, update } = setup()
    const out = await createUpdateBlockTool(deps).handler(
      { ...at, field: 'layout', blockId: 'a', patch: { text: '' } },
      editor,
    )
    expect(out).toMatchObject({ problems: [{ path: 'text' }] })
    expect(update).not.toHaveBeenCalled()
  })

  it('will not change a block’s type or id', async () => {
    const { deps } = setup()
    const tool = createUpdateBlockTool(deps)
    await expect(
      tool.handler({ ...at, field: 'layout', blockId: 'a', patch: { blockType: 'Cta' } }, editor),
    ).resolves.toEqual({ error: expect.stringMatching(/type cannot change/) })
    await expect(
      tool.handler({ ...at, field: 'layout', blockId: 'a', patch: { id: 'z' } }, editor),
    ).resolves.toEqual({ error: expect.stringMatching(/id cannot change/) })
  })
})

describe('move_block', () => {
  it('moves after another block, or to the start', async () => {
    let s = setup()
    await createMoveBlockTool(s.deps).handler({ ...at, field: 'layout', blockId: 'a', after: 'c' }, editor)
    expect(savedRows(s.update).map((r: Row) => r.id)).toEqual(['b', 'c', 'a'])

    s = setup()
    await createMoveBlockTool(s.deps).handler({ ...at, field: 'layout', blockId: 'c', position: 'start' }, editor)
    expect(savedRows(s.update).map((r: Row) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('refuses an order the composition rules forbid', async () => {
    const validator = vi.fn(async () => ({
      issues: [{ severity: 'error', rule: 'forbidden-adjacent', message: 'Quote may not follow Quote', blockIndex: 1 }],
    }))
    const { deps, update } = setup({ validator })
    const out = await createMoveBlockTool(deps).handler({ ...at, field: 'layout', blockId: 'c', after: 'a' }, editor)
    expect(out).toMatchObject({
      error: 'layout would break 1 composition rule. Nothing was saved.',
      issues: [{ rule: 'forbidden-adjacent', index: 1 }],
    })
    expect(update).not.toHaveBeenCalled()
  })
})

describe('remove_block', () => {
  it('removes one block by id', async () => {
    const { deps, update } = setup()
    await createRemoveBlockTool(deps).handler({ ...at, field: 'layout', blockId: 'b' }, editor)
    expect(savedRows(update).map((r: Row) => r.id)).toEqual(['a', 'c'])
  })

  it('says so when there is no such block', async () => {
    const { deps } = setup()
    const out = await createRemoveBlockTool(deps).handler({ ...at, field: 'layout', blockId: 'q' }, editor)
    expect(out).toEqual({ error: expect.stringMatching(/no block "q" in layout/) })
  })
})

describe('edit_blocks', () => {
  const tool = (deps: ContentWriteDeps) => createEditBlocksTool(deps)

  it('applies the operations in order and saves once', async () => {
    const { deps, update, audit } = setup()
    const out = await tool(deps).handler(
      {
        ...at,
        field: 'layout',
        operations: [
          { op: 'remove', blockId: 'b' },
          { op: 'insert', block: { blockType: 'Cta', label: 'Replace' }, after: 'a' },
          { op: 'update', blockId: 'c', patch: { text: 'Third' } },
          { op: 'move', blockId: 'c', position: 'start' },
        ],
      },
      editor,
    )
    expect(update).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledTimes(1)
    const rows = savedRows(update)
    expect(rows.map((r: Row) => r.blockType)).toEqual(['Quote', 'Quote', 'Cta'])
    expect(rows[0]).toMatchObject({ id: 'c', text: 'Third' })
    expect(rows[2]).toMatchObject({ blockType: 'Cta', label: 'Replace' })
    expect(out).toMatchObject({ field: 'layout', blockIds: ['b', rows[2]!.id, 'c', 'c'] })
  })

  it('checks the composition rules against the end result only, not each step', async () => {
    // Two Quotes side by side are forbidden; the intermediate state has them, the end state does not.
    const validator = vi.fn(async ({ blocks }: { blocks: { type: string }[] }) => ({
      issues: blocks.some((b, i) => i > 0 && b.type === 'Quote' && blocks[i - 1]!.type === 'Quote')
        ? [{ severity: 'error', rule: 'forbidden-adjacent', message: 'Quote may not follow Quote', blockIndex: 1 }]
        : [],
    }))
    const { deps, update } = setup({ validator })
    await tool(deps).handler(
      {
        ...at,
        field: 'layout',
        operations: [
          { op: 'remove', blockId: 'b' },
          { op: 'insert', block: { blockType: 'Cta' }, after: 'a' },
        ],
      },
      editor,
    )
    expect(validator).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('saves nothing when one operation fails, and says which', async () => {
    const { deps, update } = setup()
    const out = await tool(deps).handler(
      {
        ...at,
        field: 'layout',
        operations: [
          { op: 'insert', block: { blockType: 'Cta' } },
          { op: 'remove', blockId: 'nope' },
        ],
      },
      editor,
    )
    expect(out).toMatchObject({ operation: 1, error: expect.stringMatching(/^Operation 1: There is no block "nope".*Nothing was saved\.$/) })
    expect(update).not.toHaveBeenCalled()
  })

  it('validates a block that stays, and not one a later operation removed', async () => {
    let s = setup()
    const invalid = await tool(s.deps).handler(
      { ...at, field: 'layout', operations: [{ op: 'insert', block: { blockType: 'Quote' } }] },
      editor,
    )
    expect(invalid).toMatchObject({ problems: [{ path: 'text' }] })
    expect(s.update).not.toHaveBeenCalled()

    s = setup()
    await tool(s.deps).handler(
      {
        ...at,
        field: 'layout',
        operations: [
          { op: 'update', blockId: 'a', patch: { text: '' } },
          { op: 'remove', blockId: 'a' },
        ],
      },
      editor,
    )
    expect(s.update).toHaveBeenCalledTimes(1)
    expect(savedRows(s.update).map((r: Row) => r.id)).toEqual(['b', 'c'])
  })

  it('refuses a field that is not a blocks field, before reading anything', async () => {
    const { deps, update } = setup()
    const out = await tool(deps).handler(
      { ...at, field: 'tags', operations: [{ op: 'remove', blockId: 'a' }] },
      editor,
    )
    expect(out).toMatchObject({ error: expect.stringContaining('not a blocks field') })
    expect(update).not.toHaveBeenCalled()
  })
})

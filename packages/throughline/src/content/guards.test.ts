import type { Block, Field, Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { COMPONENTS_VALIDATOR_SYMBOL } from '../publishing/pipeline/steps/composition.js'
import {
  compositionErrors,
  disallowedBlocks,
  lockHolder,
  lockRefusal,
  mergePatch,
  refusedFields,
} from './guards.js'

describe('refusedFields', () => {
  it('refuses the fields that would publish, or that nobody should set, each with its reason', () => {
    const out = refusedFields(
      { title: 'x', _status: 'published', publishedAt: 'now', narration: {}, policy: {} },
      ['title'],
    )
    expect(out.map((r) => r.field)).toEqual(['_status', 'publishedAt', 'narration', 'policy'])
    expect(out[0]!.reason).toMatch(/always drafts.*publish, schedule_publish or request_approval/)
    expect(out[3]!.reason).toMatch(/approval policy is set by a person/)
  })

  it('refuses anything off the allow-list, naming what can be set', () => {
    expect(refusedFields({ secretField: 1 }, ['title', 'slug'])).toEqual([
      { field: 'secretField', reason: expect.stringMatching(/Settable: title, slug\./) },
    ])
  })

  it('accepts what is on the list', () => {
    expect(refusedFields({ title: 'x', slug: 'y' }, ['title', 'slug'])).toEqual([])
  })
})

describe('mergePatch', () => {
  const fields: Field[] = [
    { name: 'title', type: 'text' },
    {
      name: 'meta',
      type: 'group',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
        { name: 'social', type: 'group', fields: [{ name: 'image', type: 'text' }] },
      ],
    },
    { name: 'stats', type: 'array', fields: [{ name: 'value', type: 'text' }] },
  ]
  const current = {
    title: 'Old',
    meta: { title: 'Old meta', description: 'Kept', social: { image: 'a.jpg' } },
    stats: [{ value: '1' }, { value: '2' }],
  }

  it('merges a group, so setting one of its fields keeps the others', () => {
    expect(mergePatch(current, { meta: { title: 'New meta' } }, fields)).toEqual({
      meta: { title: 'New meta', description: 'Kept', social: { image: 'a.jpg' } },
    })
  })

  it('merges a group inside a group', () => {
    expect(mergePatch(current, { meta: { social: { image: 'b.jpg' } } }, fields)).toEqual({
      meta: { title: 'Old meta', description: 'Kept', social: { image: 'b.jpg' } },
    })
  })

  it('replaces an array whole, and returns only what the patch touched', () => {
    expect(mergePatch(current, { stats: [{ value: '3' }], title: 'New' }, fields)).toEqual({
      stats: [{ value: '3' }],
      title: 'New',
    })
  })
})

describe('lockHolder', () => {
  const recent = () => new Date(Date.now() - 30_000).toISOString()
  const stale = () => new Date(Date.now() - 600_000).toISOString()
  function payloadWith(lock: unknown, lockDocuments?: unknown) {
    const find = vi.fn(async () => ({ docs: lock ? [lock] : [] }))
    return {
      find,
      payload: {
        find,
        collections: {
          pages: { config: { lockDocuments } },
          'payload-locked-documents': { config: {} },
        },
      } as unknown as Payload,
    }
  }

  it('names who has the document open', async () => {
    const { payload, find } = payloadWith({
      updatedAt: recent(),
      user: { value: { id: 4, name: 'Jane Editor', email: 'jane@x.test' } },
    })
    await expect(lockHolder(payload, 'pages', 7, 9)).resolves.toMatchObject({
      user: 'Jane Editor',
      self: false,
    })
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'payload-locked-documents',
        where: {
          and: [{ 'document.relationTo': { equals: 'pages' } }, { 'document.value': { equals: 7 } }],
        },
      }),
    )
  })

  it("counts the key holder's own open tab as a lock, because it autosaves", async () => {
    const { payload } = payloadWith({ updatedAt: recent(), user: { value: { id: 9, email: 'me@x.test' } } })
    const lock = await lockHolder(payload, 'pages', 7, '9')
    expect(lock).toMatchObject({ user: 'me@x.test', self: true })
    expect(lockRefusal('pages', 7, lock!).error).toMatch(/^You have pages 7 open/)
  })

  it('ignores a lock older than the collection’s duration', async () => {
    const { payload } = payloadWith({ updatedAt: stale(), user: { value: { id: 4 } } })
    await expect(lockHolder(payload, 'pages', 7, 9)).resolves.toBeUndefined()
    const longer = payloadWith({ updatedAt: stale(), user: { value: { id: 4 } } }, { duration: 3600 })
    await expect(lockHolder(longer.payload, 'pages', 7, 9)).resolves.toMatchObject({ user: '4' })
  })

  it('asks nothing of a collection with locking off', async () => {
    const { payload, find } = payloadWith({ updatedAt: recent() }, false)
    await expect(lockHolder(payload, 'pages', 7, 9)).resolves.toBeUndefined()
    expect(find).not.toHaveBeenCalled()
  })
})

describe('disallowedBlocks', () => {
  const quote: Block = { slug: 'Quote', fields: [] }
  const hero: Block = { slug: 'Hero', fields: [] }
  const field = {
    name: 'layout',
    type: 'blocks',
    blocks: [quote, hero],
    blockReferences: ['Card'],
    // As offered.ts's keepWhatIsThere: the offered list, plus whatever the document holds.
    filterOptions: ({ siblingData }: { siblingData: { layout?: { blockType: string }[] } }) => [
      'Quote',
      'Card',
      ...(siblingData.layout ?? []).map((row) => row.blockType),
    ],
  } as unknown as Extract<Field, { type: 'blocks' }>
  const registry = new Map<string, Block>([['Card', { slug: 'Card', fields: [] }]])
  const req = { user: null } as unknown as PayloadRequest

  it('refuses a block the picker would not offer, and one that does not exist', async () => {
    const rows = [{ blockType: 'Quote' }, { blockType: 'Hero' }, { blockType: 'Nope' }, {}]
    await expect(disallowedBlocks(field, rows, [], registry, req)).resolves.toEqual([
      'Hero',
      'Nope',
      '(no blockType)',
    ])
  })

  it('keeps a block the document already holds, as the admin does', async () => {
    const rows = [{ blockType: 'Hero' }, { blockType: 'Card' }]
    await expect(disallowedBlocks(field, rows, [{ blockType: 'Hero' }], registry, req)).resolves.toEqual([])
  })
})

describe('compositionErrors', () => {
  it('asks the validator the publish pipeline asks, and keeps only errors', async () => {
    const validator = vi.fn(async () => ({
      issues: [
        { severity: 'error', rule: 'max-per-page', message: 'One hero only', blockIndex: 1 },
        { severity: 'warning', rule: 'advice', message: 'Consider…' },
      ],
    }))
    const payload = { [COMPONENTS_VALIDATOR_SYMBOL]: validator } as unknown as Payload
    const out = await compositionErrors(payload, [
      { blockType: 'Hero', variant: 'dark' },
      { blockType: 'Hero' },
    ])
    expect(validator).toHaveBeenCalledWith({
      blocks: [{ type: 'Hero', variant: 'dark' }, { type: 'Hero' }],
    })
    expect(out).toEqual([{ rule: 'max-per-page', message: 'One hero only', index: 1 }])
  })

  it('says nothing either way without the components plugin', async () => {
    await expect(compositionErrors({} as Payload, [{ blockType: 'Hero' }])).resolves.toBeUndefined()
  })
})

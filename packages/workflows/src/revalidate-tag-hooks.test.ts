import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'
import { createCacheTags, defaultCacheTags } from './cache-tags.js'

/*
The tag-revalidation hooks: which tag each one fires, when it fires nothing, and
what it does when Next is not there to be told.

The tag assertions are made against the builder, not against literal strings.
A tag is one string with two ends, and the failure worth testing for is the two
ends disagreeing — so both ends are asserted against the one place that builds
them.
*/

const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: vi.fn(),
}))

const isDraftWrite = vi.fn()
vi.mock('@forumone/throughline-publishing', () => ({
  isDraftWrite: (...args: unknown[]) => isDraftWrite(...args),
}))

const { createTagRevalidationHooks } = await import('./revalidate-tag-hooks.js')

const logger = { debug: vi.fn(), error: vi.fn() }
const req = { payload: { logger }, context: {} }

function change(
  hook: CollectionAfterChangeHook,
  {
    slug = 'pages',
    operation = 'update',
    doc = { id: 'p1' },
  }: { slug?: string; operation?: 'create' | 'update'; doc?: Record<string, unknown> } = {},
) {
  return (hook as (args: unknown) => Promise<unknown>)({
    collection: { slug },
    doc,
    previousDoc: doc,
    operation,
    req,
    context: {},
  })
}

function remove(hook: CollectionAfterDeleteHook, slug = 'pages') {
  return (hook as (args: unknown) => Promise<unknown>)({
    collection: { slug },
    doc: { id: 'p1' },
    id: 'p1',
    req,
    context: {},
  })
}

function saveGlobal(hook: GlobalAfterChangeHook, slug = 'navigation') {
  return (hook as (args: unknown) => Promise<unknown>)({
    global: { slug },
    doc: { items: [] },
    previousDoc: {},
    req,
    context: {},
  })
}

const tagsDropped = () => revalidateTag.mock.calls.map((call) => call[0] as string)

beforeEach(() => {
  revalidateTag.mockReset()
  isDraftWrite.mockReset()
  isDraftWrite.mockReturnValue(false)
  logger.debug.mockClear()
  logger.error.mockClear()
})

describe('the tag each hook fires', () => {
  const hooks = createTagRevalidationHooks()

  it('drops the collection tag on a change', async () => {
    await change(hooks.afterCollectionChange(), { slug: 'jobs' })
    expect(revalidateTag).toHaveBeenCalledWith(defaultCacheTags.collection('jobs'), { expire: 0 })
  })

  it('drops it on delete too', async () => {
    await remove(hooks.afterCollectionDelete(), 'jobs')
    expect(revalidateTag).toHaveBeenCalledWith(defaultCacheTags.collection('jobs'), { expire: 0 })
  })

  it('drops the global tag when a global is saved', async () => {
    await saveGlobal(hooks.afterGlobalChange(), 'footer')
    expect(revalidateTag).toHaveBeenCalledWith(defaultCacheTags.global('footer'), { expire: 0 })
  })

  // `revalidateTag(tag)` with one argument warns on every call under Next 16.
  it('always passes the immediate-expiry profile Next 16 requires', async () => {
    await change(hooks.afterCollectionChange())
    await remove(hooks.afterCollectionDelete())
    await saveGlobal(hooks.afterGlobalChange())
    expect(revalidateTag).toHaveBeenCalledTimes(3)
    for (const call of revalidateTag.mock.calls)
      expect(call).toEqual([expect.any(String), { expire: 0 }])
  })

  it('drops the tags a selector names, once each', async () => {
    // A navigation global that links to pages caches their slugs, so a page
    // change has to drop the navigation too.
    const hook = hooks.afterCollectionChange({
      tags: (t, slug) => [t.collection(slug), t.global('navigation'), t.collection(slug)],
    })
    await change(hook)
    expect(tagsDropped()).toEqual([
      defaultCacheTags.collection('pages'),
      defaultCacheTags.global('navigation'),
    ])
  })

  it('builds every tag from the scheme it is given', async () => {
    const cacheTags = createCacheTags({
      collection: (slug) => `c:${slug}`,
      global: (slug) => `g:${slug}`,
    })
    const custom = createTagRevalidationHooks({ cacheTags })

    await change(custom.afterCollectionChange())
    await remove(custom.afterCollectionDelete())
    await saveGlobal(custom.afterGlobalChange())

    expect(tagsDropped()).toEqual([
      cacheTags.collection('pages'),
      cacheTags.collection('pages'),
      cacheTags.global('navigation'),
    ])
    expect(tagsDropped()).toEqual(['c:pages', 'c:pages', 'g:navigation'])
  })

  it('uses a supplied revalidateTag instead of Next', async () => {
    const own = vi.fn()
    const custom = createTagRevalidationHooks({ revalidateTag: own })
    await saveGlobal(custom.afterGlobalChange())
    expect(own).toHaveBeenCalledWith(defaultCacheTags.global('navigation'))
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('returns the document, so the save is not altered', async () => {
    expect(await change(hooks.afterCollectionChange())).toEqual({ id: 'p1' })
    expect(await remove(hooks.afterCollectionDelete())).toEqual({ id: 'p1' })
    expect(await saveGlobal(hooks.afterGlobalChange())).toEqual({ items: [] })
  })
})

/*
With autosave on, a draft save happens every few seconds of an open editor.
Each one used to evict the tag. An unpublish must still drop — it ends in a
draft state too, and it is the case that would otherwise leave a cached link
pointing at a 404 — which is why this is publishing's `isDraftWrite` and not a
look at `_status`.
*/
describe('draft writes', () => {
  const hooks = createTagRevalidationHooks()

  it('drops nothing on a draft save', async () => {
    isDraftWrite.mockReturnValue(true)
    await change(hooks.afterCollectionChange())
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('drops nothing across a run of autosaves', async () => {
    isDraftWrite.mockReturnValue(true)
    const hook = hooks.afterCollectionChange()
    for (let i = 0; i < 20; i++) await change(hook)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('drops on an update that is not a draft write, unpublish included', async () => {
    isDraftWrite.mockReturnValue(false)
    await change(hooks.afterCollectionChange(), { doc: { id: 'p1', _status: 'draft' } })
    expect(revalidateTag).toHaveBeenCalledTimes(1)
  })

  it('asks about this document, in this collection', async () => {
    await change(hooks.afterCollectionChange(), { slug: 'posts', doc: { id: 'x9' } })
    expect(isDraftWrite).toHaveBeenCalledWith(req, 'posts', 'x9')
  })

  it('drops nothing when a document is created as a draft', async () => {
    await change(hooks.afterCollectionChange(), {
      operation: 'create',
      doc: { id: 'new', _status: 'draft' },
    })
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('drops when a document is created published, or in a collection without drafts', async () => {
    await change(hooks.afterCollectionChange(), {
      operation: 'create',
      doc: { id: 'a', _status: 'published' },
    })
    await change(hooks.afterCollectionChange(), { operation: 'create', doc: { id: 'b' } })
    expect(revalidateTag).toHaveBeenCalledTimes(2)
  })

  it('returns the document either way', async () => {
    for (const draft of [true, false]) {
      isDraftWrite.mockReturnValue(draft)
      expect(await change(hooks.afterCollectionChange())).toEqual({ id: 'p1' })
    }
  })
})

describe('operations', () => {
  const hooks = createTagRevalidationHooks()

  // An upload cannot be referenced by anything cached yet.
  it('skips the operations it is not given', async () => {
    const hook = hooks.afterCollectionChange({ operations: ['update'] })
    await change(hook, { slug: 'media', operation: 'create' })
    expect(revalidateTag).not.toHaveBeenCalled()

    await change(hook, { slug: 'media', operation: 'update' })
    expect(tagsDropped()).toEqual([defaultCacheTags.collection('media')])
  })
})

describe('when Next is not there to be told', () => {
  const hooks = createTagRevalidationHooks()

  // Seeds, migrations and the CLI write through the same hooks under `tsx`.
  it('says nothing above debug when there is no request to revalidate', async () => {
    revalidateTag.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing in revalidateTag navigation')
    })

    await expect(saveGlobal(hooks.afterGlobalChange())).resolves.toEqual({ items: [] })
    expect(logger.debug).toHaveBeenCalledWith(
      { tag: defaultCacheTags.global('navigation') },
      expect.any(String),
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs any other failure at error, with the cause, rather than swallowing it', async () => {
    const failure = new Error('cache handler unreachable')
    revalidateTag.mockImplementation(() => {
      throw failure
    })

    await change(hooks.afterCollectionChange())
    expect(logger.error).toHaveBeenCalledWith(
      { err: failure, tag: defaultCacheTags.collection('pages') },
      expect.stringContaining('stale'),
    )
    expect(logger.debug).not.toHaveBeenCalled()
  })

  // Failing the hook would roll back the editor's save over a cache miss.
  it('does not throw, from any hook', async () => {
    revalidateTag.mockImplementation(() => {
      throw new Error('boom')
    })
    await expect(change(hooks.afterCollectionChange())).resolves.toEqual({ id: 'p1' })
    await expect(remove(hooks.afterCollectionDelete())).resolves.toEqual({ id: 'p1' })
    await expect(saveGlobal(hooks.afterGlobalChange())).resolves.toEqual({ items: [] })
    expect(logger.error).toHaveBeenCalledTimes(3)
  })

  it('keeps dropping the remaining tags after one fails', async () => {
    revalidateTag.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const hook = hooks.afterCollectionChange({
      tags: (t, slug) => [t.collection(slug), t.global('navigation')],
    })
    await change(hook)
    expect(tagsDropped()).toEqual([
      defaultCacheTags.collection('pages'),
      defaultCacheTags.global('navigation'),
    ])
  })

  it('surfaces a supplied revalidator rejecting, too', async () => {
    const custom = createTagRevalidationHooks({
      revalidateTag: async () => {
        throw new Error('purge failed')
      },
    })
    await saveGlobal(custom.afterGlobalChange())
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})

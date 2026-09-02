import { describe, expect, it, vi } from 'vitest'
import { APIError } from 'payload'
import type { CollectionBeforeChangeHook, CollectionBeforeOperationHook } from 'payload'
import { createBlockStatusWritesHook } from './block-status-writes.js'
import { createRecordDraftWritesHook } from './draft-writes.js'

const blockHook = createBlockStatusWritesHook()
const recordHook = createRecordDraftWritesHook() as CollectionBeforeOperationHook

type HookArgs = Parameters<CollectionBeforeChangeHook>[0]

/**
 * Models one Payload update as the real operation performs it:
 *
 * - `beforeOperation` records the operation's `draft` flag,
 * - Payload merges the stored document into `data` (so `_status` is always
 *   present) and injects `_status: 'draft'` when saving a draft,
 * - `originalDoc` is the *latest version*, which may be a draft sitting on
 *   top of a still-live document,
 * - `beforeChange` runs, and may read the live row back.
 *
 * These shapes are taken from Payload's `updateDocument` and verified
 * against a real instance in `block-status-writes.integration.test.ts`.
 */
function update(options: {
  draft?: boolean
  /** `_status` of the latest version — what `originalDoc` carries. */
  latestVersion: 'draft' | 'published'
  /** `_status` of the live row, when it differs from the latest version. */
  live?: 'draft' | 'published'
  /** An explicit status from the caller, before Payload's own injection. */
  requested?: 'draft' | 'published'
  context?: Record<string, unknown>
  recordDraftFlag?: boolean
  id?: number | string
}) {
  const id = options.id ?? 1
  const req = {
    context: {} as Record<string, unknown>,
    payload: {
      findByID: vi.fn(async () => ({ id, _status: options.live ?? options.latestVersion })),
    },
  }

  if (options.recordDraftFlag !== false) {
    void recordHook({
      args: { collection: { config: { slug: 'pages' } }, draft: options.draft === true, id, req },
      collection: { slug: 'pages' },
      context: req.context,
      operation: 'update',
      req,
    } as never)
  }

  // Payload sets `_status: 'draft'` for a draft save unless the caller
  // asked for `published`; otherwise the stored status comes through.
  const injected =
    options.draft && options.requested !== 'published' ? 'draft' : options.requested
  const nextStatus = injected ?? options.latestVersion

  const run = () =>
    (blockHook as CollectionBeforeChangeHook)({
      operation: 'update',
      data: { title: 'A title', _status: nextStatus },
      originalDoc: { id, _status: options.latestVersion },
      context: options.context ?? {},
      req,
      collection: { slug: 'pages' } as never,
    } as HookArgs)

  return { run, findByID: req.payload.findByID }
}

const allowed = async (opts: Parameters<typeof update>[0]) =>
  expect(update(opts).run()).resolves.toBeDefined()

const blocked = async (opts: Parameters<typeof update>[0]) =>
  expect(update(opts).run()).rejects.toThrow(/Direct writes to `_status` are not allowed/)

describe('createBlockStatusWritesHook', () => {
  it('ignores create operations', async () => {
    await expect(
      (blockHook as CollectionBeforeChangeHook)({
        operation: 'create',
        data: { _status: 'published' },
        context: {},
        req: { context: {} },
        collection: { slug: 'pages' } as never,
      } as HookArgs),
    ).resolves.toBeDefined()
  })

  it('ignores updates on collections without drafts', async () => {
    await expect(
      (blockHook as CollectionBeforeChangeHook)({
        operation: 'update',
        data: { title: 'No status field here' },
        originalDoc: { id: 1 },
        context: {},
        req: { context: {} },
        collection: { slug: 'pages' } as never,
      } as HookArgs),
    ).resolves.toBeDefined()
  })

  it('lets the pipeline through on the hook context', async () => {
    await allowed({
      latestVersion: 'published',
      requested: 'draft',
      context: { bypassPublishingServer: true },
    })
  })

  it('lets the pipeline through on req.context', async () => {
    // `payload.update({ context })` puts the flag on the request, which is
    // how the pipeline's own writes actually arrive.
    await expect(
      (blockHook as CollectionBeforeChangeHook)({
        operation: 'update',
        data: { _status: 'draft' },
        originalDoc: { id: 1, _status: 'published' },
        context: {},
        req: { context: { bypassPublishingServer: true } },
        collection: { slug: 'pages' } as never,
      } as HookArgs),
    ).resolves.toBeDefined()
  })

  it('reports a blocked write as APIError 400 so the admin can show it', async () => {
    let thrown: unknown
    try {
      await update({ latestVersion: 'published', requested: 'draft' }).run()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(APIError)
    expect((thrown as APIError).status).toBe(400)
  })
})

/**
 * The behaviour matrix, mirroring
 * `block-status-writes.integration.test.ts` run against real Payload.
 */
describe('what reaches the public', () => {
  describe('draft saves — a version, never the live document', () => {
    it('allows a draft save of a published document', async () => {
      await allowed({ draft: true, latestVersion: 'published' })
    })

    it('allows a draft save when a draft is already pending', async () => {
      await allowed({ draft: true, latestVersion: 'draft', live: 'published' })
    })

    it('allows a draft save of a never-published document', async () => {
      await allowed({ draft: true, latestVersion: 'draft', live: 'draft' })
    })

    // `draft` must not become a way to publish around the pipeline.
    it('blocks a draft request that asks for published', async () => {
      await blocked({ draft: true, latestVersion: 'draft', live: 'draft', requested: 'published' })
    })
  })

  describe('ordinary edits — status unchanged, nothing pending', () => {
    // Payload merges the stored document into `data`, so an ordinary field
    // edit arrives carrying `_status: 'published'`. Blocking these would
    // make published documents uneditable.
    it('allows a non-draft edit of a published document', async () => {
      await allowed({ latestVersion: 'published' })
    })

    it('allows a non-draft edit that restates published', async () => {
      await allowed({ latestVersion: 'published', requested: 'published' })
    })

    it('allows a non-draft write of draft to a never-published document', async () => {
      await allowed({ latestVersion: 'draft', live: 'draft', requested: 'draft' })
    })

    it('allows a non-draft write of draft to an already-unpublished document', async () => {
      await allowed({ latestVersion: 'draft', live: 'draft' })
    })
  })

  describe('unpublishing — must go through the pipeline', () => {
    it('blocks a direct unpublish', async () => {
      await blocked({ latestVersion: 'published', requested: 'draft' })
    })

    // The reported hole: once a draft version exists, `originalDoc._status`
    // is 'draft' while the document is still live, so a same-status
    // comparison read this as a harmless no-op and let it through.
    it('blocks a direct unpublish when a draft is pending', async () => {
      await blocked({ latestVersion: 'draft', live: 'published', requested: 'draft' })
    })

    it('blocks a plain edit that would silently take a live document down', async () => {
      // No explicit status: Payload merges 'draft' from the pending version,
      // which on a non-draft write would unpublish the document.
      await blocked({ latestVersion: 'draft', live: 'published' })
    })
  })

  describe('publishing — must go through the pipeline', () => {
    it('blocks a direct publish of a draft document', async () => {
      await blocked({ latestVersion: 'draft', live: 'draft', requested: 'published' })
    })

    // Live status stays 'published' throughout, so this is invisible to any
    // status comparison — but it is what puts the pending draft live.
    it('blocks promoting a pending draft outside the pipeline', async () => {
      await blocked({ latestVersion: 'draft', live: 'published', requested: 'published' })
    })
  })

  describe('cost', () => {
    it('does not read the live row for a draft save', async () => {
      const { run, findByID } = update({ draft: true, latestVersion: 'published' })
      await run()
      expect(findByID).not.toHaveBeenCalled()
    })

    it('does not read the live row for an ordinary published edit', async () => {
      const { run, findByID } = update({ latestVersion: 'published' })
      await run()
      expect(findByID).not.toHaveBeenCalled()
    })
  })

  describe('missing evidence', () => {
    it('blocks when the draft-write recorder was never installed', async () => {
      await blocked({ draft: true, latestVersion: 'published', recordDraftFlag: false })
    })

    it('blocks when the live status cannot be read', async () => {
      const req = {
        context: {},
        payload: {
          findByID: vi.fn(async () => {
            throw new Error('connection lost')
          }),
        },
      }
      await expect(
        (blockHook as CollectionBeforeChangeHook)({
          operation: 'update',
          data: { _status: 'draft' },
          originalDoc: { id: 1, _status: 'draft' },
          context: {},
          req,
          collection: { slug: 'pages' } as never,
        } as HookArgs),
      ).rejects.toThrow(/Direct writes to `_status` are not allowed/)
    })
  })
})

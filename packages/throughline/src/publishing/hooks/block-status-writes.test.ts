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
  /** The live row's title, when a test needs its content. */
  liveTitle?: string
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
      findByID: vi.fn(async () => ({
        id,
        _status: options.live ?? options.latestVersion,
        ...(options.liveTitle === undefined ? {} : { title: options.liveTitle }),
      })),
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
  const injected = options.draft && options.requested !== 'published' ? 'draft' : options.requested
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
  expect(update(opts).run()).rejects.toThrow(/can.t be published or unpublished from here/)

const refusedAsLiveEdit = async (opts: Parameters<typeof update>[0]) =>
  expect(update(opts).run()).rejects.toThrow(/This page is live\. Save your change as a draft/)

const create = (data: Record<string, unknown>, context: Record<string, unknown> = {}) =>
  (blockHook as CollectionBeforeChangeHook)({
    operation: 'create',
    data,
    context,
    req: { context: {} },
    collection: { slug: 'pages' } as never,
  } as HookArgs)

describe('createBlockStatusWritesHook', () => {
  // A create used to be skipped, so one carrying `published` went live with no
  // pipeline: over REST, or through Payload's MCP `create` tools.
  it('refuses a create that would be live at once', async () => {
    await expect(create({ title: 'New', _status: 'published' })).rejects.toThrow(
      /Create it as a draft, then publish it/,
    )
  })

  it('allows a create as a draft', async () => {
    await expect(create({ title: 'New', _status: 'draft' })).resolves.toBeDefined()
  })

  it('lets the pipeline create a published document', async () => {
    await expect(
      create({ title: 'New', _status: 'published' }, { bypassPublishingServer: true }),
    ).resolves.toBeDefined()
  })

  it('does not let a derived write create a published document', async () => {
    await expect(
      create({ title: 'New', _status: 'published' }, { throughlineDerivedWrite: true }),
    ).rejects.toThrow(/Create it as a draft/)
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

  describe('edits to a live document — through the pipeline', () => {
    // Payload merges the stored document into `data`, so an edit arrives
    // carrying `_status: 'published'`. Allowing it changed live content with
    // no check, approval-required pages included. Editors save a draft and
    // publish it, which is what the admin's buttons do.
    it('refuses a non-draft edit of a published document', async () => {
      await refusedAsLiveEdit({ latestVersion: 'published' })
    })

    it('refuses a non-draft edit that restates published', async () => {
      await refusedAsLiveEdit({ latestVersion: 'published', requested: 'published' })
    })

    it('allows a non-draft write that changes nothing live', async () => {
      await allowed({ latestVersion: 'published', liveTitle: 'A title' })
    })

    it('allows a derived write to a live document with nothing pending', async () => {
      await allowed({ latestVersion: 'published', context: { throughlineDerivedWrite: true } })
    })

    it('does not let a derived write promote a pending draft', async () => {
      await blocked({
        latestVersion: 'draft',
        live: 'published',
        requested: 'published',
        context: { throughlineDerivedWrite: true },
      })
    })

    it('does not let a derived write unpublish', async () => {
      await blocked({
        latestVersion: 'published',
        requested: 'draft',
        context: { throughlineDerivedWrite: true },
      })
    })
  })

  describe('ordinary writes — nothing live', () => {
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

    it('blocks promoting a pending draft whose content differs from the live row', async () => {
      await blocked({
        latestVersion: 'draft',
        live: 'published',
        liveTitle: 'The live title',
        requested: 'published',
      })
    })
  })

  describe('reverting to published — the live content, written back', () => {
    // Payload's "Revert to published" reads the live document and writes it
    // back with no draft flag. It discards the draft and changes nothing a
    // reader sees.
    it('allows a non-draft write that restates the live content', async () => {
      await allowed({
        latestVersion: 'draft',
        live: 'published',
        liveTitle: 'A title',
        requested: 'published',
      })
    })

    it('blocks the same write when nothing is live', async () => {
      await blocked({
        latestVersion: 'draft',
        live: 'draft',
        liveTitle: 'A title',
        requested: 'published',
      })
    })
  })

  describe('cost', () => {
    it('does not read the live row for a draft save', async () => {
      const { run, findByID } = update({ draft: true, latestVersion: 'published' })
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
      ).rejects.toThrow(/can.t be published or unpublished from here/)
    })
  })
})

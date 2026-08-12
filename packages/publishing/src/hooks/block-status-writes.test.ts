import { describe, expect, it } from 'vitest'
import { APIError } from 'payload'
import type { CollectionBeforeChangeHook, CollectionBeforeOperationHook } from 'payload'
import { createBlockStatusWritesHook } from './block-status-writes.js'
import { createRecordDraftWritesHook } from './draft-writes.js'

type HookArgs = Parameters<CollectionBeforeChangeHook>[0]

function callHook(hook: CollectionBeforeChangeHook, args: Partial<HookArgs>) {
  return hook({
    operation: 'update',
    data: {},
    originalDoc: {},
    context: {},
    req: { context: {} },
    collection: { slug: 'pages' } as never,
    ...args,
  } as HookArgs)
}

describe('createBlockStatusWritesHook', () => {
  const hook = createBlockStatusWritesHook()

  it('passes through update operations that do not touch _status', () => {
    expect(() =>
      callHook(hook, { data: { title: 'New' } }),
    ).not.toThrow()
  })

  it('passes through create operations regardless of _status', () => {
    expect(() =>
      callHook(hook, {
        operation: 'create',
        data: { _status: 'published' },
      } as Partial<HookArgs>),
    ).not.toThrow()
  })

  it('passes through no-op status writes (same value)', () => {
    expect(() =>
      callHook(hook, {
        data: { _status: 'draft' },
        originalDoc: { _status: 'draft' },
      }),
    ).not.toThrow()
  })

  it('throws when _status changes without the bypass flag', () => {
    expect(() =>
      callHook(hook, {
        data: { _status: 'published' },
        originalDoc: { _status: 'draft' },
      }),
    ).toThrow(/Direct writes to `_status` are not allowed/)
  })

  // A plain Error becomes a 500 and a generic "Something went wrong" toast.
  // APIError carries the message and status to the admin, which is the whole
  // difference between log-diving and reading the reason on screen.
  it('throws APIError with status 400 so the message reaches the admin', () => {
    let thrown: unknown
    try {
      callHook(hook, {
        data: { _status: 'published' },
        originalDoc: { _status: 'draft' },
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(APIError)
    expect((thrown as APIError).status).toBe(400)
    expect((thrown as APIError).message).toMatch(/Use the publishing server/)
  })

  it('passes through when bypass flag is set on hook context', () => {
    expect(() =>
      callHook(hook, {
        data: { _status: 'published' },
        originalDoc: { _status: 'draft' },
        context: { bypassPublishingServer: true },
      }),
    ).not.toThrow()
  })

  it('passes through when bypass flag is set on req.context', () => {
    expect(() =>
      callHook(hook, {
        data: { _status: 'published' },
        originalDoc: { _status: 'draft' },
        req: { context: { bypassPublishingServer: true } } as never,
      }),
    ).not.toThrow()
  })
})

/**
 * The reported defect: a published document could not be edited at all.
 * Payload injects `data._status = 'draft'` into every `draft: true` update
 * before `beforeChange` runs, so a draft save of a published document looked
 * exactly like an unpublish and was rejected — taking Save Draft, and the
 * editor's unsaved work, with it.
 */
describe('draft writes against a published document', () => {
  const blockHook = createBlockStatusWritesHook()
  const recordHook = createRecordDraftWritesHook()

  /** Runs the real pair of hooks over one shared `req`, as Payload does. */
  function runUpdate(options: {
    draft: boolean
    id?: number | string
    dataStatus?: string
    originalStatus?: string
  }) {
    const req = { context: {} } as never

    void (recordHook as CollectionBeforeOperationHook)({
      args: {
        collection: { config: { slug: 'pages' } },
        draft: options.draft,
        id: options.id ?? 1,
        req,
      },
      collection: { slug: 'pages' },
      context: {},
      operation: 'update',
      req,
    } as never)

    return () =>
      callHook(blockHook, {
        // Payload has already injected `_status` by this point.
        data: { _status: options.dataStatus ?? (options.draft ? 'draft' : 'published') },
        originalDoc: { id: options.id ?? 1, _status: options.originalStatus ?? 'published' },
        req,
      })
  }

  it('allows a draft save even though Payload injected _status: draft', () => {
    expect(runUpdate({ draft: true })).not.toThrow()
  })

  it('allows a draft save when the caller supplied no _status at all', () => {
    // Row two of the report: the caller passes only `{ title }`; Payload
    // adds `_status: 'draft'` before the hook sees the data.
    expect(runUpdate({ draft: true, dataStatus: 'draft' })).not.toThrow()
  })

  // The security property this whole hook exists for.
  it('still rejects a genuine unpublish — a non-draft write to draft', () => {
    expect(runUpdate({ draft: false, dataStatus: 'draft' })).toThrow(
      /Direct writes to `_status` are not allowed/,
    )
  })

  it('still rejects a direct publish outside the pipeline', () => {
    expect(
      runUpdate({ draft: false, dataStatus: 'published', originalStatus: 'draft' }),
    ).toThrow(/Direct writes to `_status` are not allowed/)
  })

  // `isSavingDraft` in Payload requires `data._status !== 'published'`, so a
  // publish is never a draft write and this direction is unreachable — but
  // pin it, because it is the one the trust boundary exists for.
  it('rejects a publish even if the request claims draft: true', () => {
    expect(
      runUpdate({ draft: true, dataStatus: 'published', originalStatus: 'draft' }),
    ).toThrow(/Direct writes to `_status` are not allowed/)
  })

  it('does not let a draft write to one document unblock another', () => {
    const req = { context: {} } as never

    void (recordHook as CollectionBeforeOperationHook)({
      args: { collection: { config: { slug: 'pages' } }, draft: true, id: 1, req },
      collection: { slug: 'pages' },
      context: {},
      operation: 'update',
      req,
    } as never)

    // Document 2 was never recorded as a draft write.
    expect(() =>
      callHook(blockHook, {
        data: { _status: 'draft' },
        originalDoc: { id: 2, _status: 'published' },
        req,
      }),
    ).toThrow(/Direct writes to `_status` are not allowed/)
  })

  it('blocks when the recording hook was never installed', () => {
    // Fail closed: without the beforeOperation hook there is no evidence
    // this is a draft write, so the stricter behaviour stands.
    expect(() =>
      callHook(blockHook, {
        data: { _status: 'draft' },
        originalDoc: { id: 1, _status: 'published' },
        req: { context: {} } as never,
      }),
    ).toThrow(/Direct writes to `_status` are not allowed/)
  })
})

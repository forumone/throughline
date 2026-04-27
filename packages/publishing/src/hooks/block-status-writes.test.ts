import { describe, expect, it } from 'vitest'
import type { CollectionBeforeChangeHook } from 'payload'
import { createBlockStatusWritesHook } from './block-status-writes.js'

type HookArgs = Parameters<CollectionBeforeChangeHook>[0]

function callHook(hook: CollectionBeforeChangeHook, args: Partial<HookArgs>) {
  return hook({
    operation: 'update',
    data: {},
    originalDoc: {},
    context: {},
    req: { context: {} },
    collection: {} as never,
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

import { describe, expect, it } from 'vitest'
import type { CollectionBeforeOperationHook, PayloadRequest } from 'payload'
import { createRecordDraftWritesHook, isDraftWrite } from './draft-writes.js'

const hook = createRecordDraftWritesHook() as CollectionBeforeOperationHook

/**
 * Mirrors Payload's `buildBeforeOperation`, which passes the operation's own
 * args plus `context: args.req.context` — the same context object that
 * reaches `beforeChange`. `updateByID` arrives as the `update` hook
 * operation.
 */
function record(args: {
  req: { context: Record<string, unknown> }
  slug?: string
  draft?: unknown
  id?: number | string
  operation?: string
}) {
  return hook({
    args: {
      collection: { config: { slug: args.slug ?? 'pages' } },
      ...(args.draft === undefined ? {} : { draft: args.draft }),
      ...(args.id === undefined ? {} : { id: args.id }),
      req: args.req,
    },
    collection: { slug: args.slug ?? 'pages' },
    context: args.req.context,
    operation: args.operation ?? 'update',
    req: args.req,
  } as never)
}

function newReq() {
  return { context: {} as Record<string, unknown> }
}

describe('createRecordDraftWritesHook', () => {
  // The Local API is the path `req.query.draft` misses, which is why the
  // flag is read from the operation args instead.
  it('records a draft: true update, as the Local API sends it', () => {
    const req = newReq()
    void record({ req, draft: true, id: 1 })
    expect(isDraftWrite(req as PayloadRequest, 'pages', 1)).toBe(true)
  })

  it('records a non-draft update as not a draft write', () => {
    const req = newReq()
    void record({ req, draft: false, id: 1 })
    expect(isDraftWrite(req as PayloadRequest, 'pages', 1)).toBe(false)
  })

  it('treats a missing draft argument as not a draft write', () => {
    const req = newReq()
    void record({ req, id: 1 })
    expect(isDraftWrite(req as PayloadRequest, 'pages', 1)).toBe(false)
  })

  // REST sends `?draft=true`, which Payload parses to a boolean before the
  // operation runs; anything still stringy is not a draft write.
  it('does not treat a non-boolean draft value as a draft write', () => {
    const req = newReq()
    void record({ req, draft: 'true', id: 1 })
    expect(isDraftWrite(req as PayloadRequest, 'pages', 1)).toBe(false)
  })

  it('scopes the flag per document', () => {
    const req = newReq()
    void record({ req, draft: true, id: 1 })
    expect(isDraftWrite(req as PayloadRequest, 'pages', 2)).toBe(false)
  })

  it('scopes the flag per collection', () => {
    const req = newReq()
    void record({ req, draft: true, id: 1, slug: 'pages' })
    expect(isDraftWrite(req as PayloadRequest, 'posts', 1)).toBe(false)
  })

  // A nested write to another document during the same request must not
  // change what the outer document's beforeChange sees.
  it('keeps concurrent writes on one request from overwriting each other', () => {
    const req = newReq()
    void record({ req, draft: true, id: 1 })
    void record({ req, draft: false, id: 2, slug: 'posts' })

    expect(isDraftWrite(req as PayloadRequest, 'pages', 1)).toBe(true)
    expect(isDraftWrite(req as PayloadRequest, 'posts', 2)).toBe(false)
  })

  it('applies a bulk update with no id to documents in that collection', () => {
    const req = newReq()
    void record({ req, draft: true })
    expect(isDraftWrite(req as PayloadRequest, 'pages', 42)).toBe(true)
  })

  it('prefers a document-scoped record over the bulk one', () => {
    const req = newReq()
    void record({ req, draft: true })
    void record({ req, draft: false, id: 7 })

    expect(isDraftWrite(req as PayloadRequest, 'pages', 7)).toBe(false)
    expect(isDraftWrite(req as PayloadRequest, 'pages', 8)).toBe(true)
  })

  it('ignores operations other than update', () => {
    const req = newReq()
    void record({ req, draft: true, id: 1, operation: 'create' })
    expect(isDraftWrite(req as PayloadRequest, 'pages', 1)).toBe(false)
  })

  it('leaves the operation args untouched', () => {
    const req = newReq()
    expect(record({ req, draft: true, id: 1 })).toBeUndefined()
  })
})

describe('isDraftWrite', () => {
  // Fail closed everywhere the evidence is missing.
  it('is false with no request', () => {
    expect(isDraftWrite(undefined, 'pages', 1)).toBe(false)
  })

  it('is false with no collection slug', () => {
    const req = newReq()
    void record({ req, draft: true, id: 1 })
    expect(isDraftWrite(req as PayloadRequest, undefined, 1)).toBe(false)
  })

  it('is false when nothing was recorded on the request', () => {
    expect(isDraftWrite({ context: {} } as PayloadRequest, 'pages', 1)).toBe(false)
  })
})

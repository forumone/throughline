import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { movesToTrash, refuseDeleteWhileReferenced, refuseTrashWhileReferenced } from './guards.js'

/*
The half the integration suite cannot reach: a scan that throws. "Could not
check" must refuse, never read as "unused", or the guard restores the defect it
exists to close in the one circumstance nobody is watching.
*/

function failingReq() {
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
  const payload = {
    config: {
      collections: [{ slug: 'pages', fields: [{ name: 'layout', type: 'blocks', blocks: [] }] }],
      globals: [],
    },
    find: vi.fn(async () => {
      throw new Error('no database')
    }),
    logger,
  }
  return { req: { payload } as unknown as PayloadRequest, logger }
}

describe('when the scan fails', () => {
  it('refuses the delete, says why, and logs it', async () => {
    const { req, logger } = failingReq()
    const hook = refuseDeleteWhileReferenced('media', { noun: 'file' })
    await expect(hook({ req, id: 5 } as never)).rejects.toThrow(
      'Could not check whether this file is still in use, so nothing has changed.',
    )
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'references.scan-failed', collection: 'media', id: 5 }),
      expect.any(String),
    )
  })

  /*
  forumone-2026#805. Payload's `routeError` shows the editor "Something went
  wrong." in place of any error `isErrorPublic` rejects, and the refusal above
  was a non-public 500, so nobody ever read it. `isErrorPublic` is not exported;
  this is its rule (payload/dist/utilities/isErrorPublic.js) with `debug` off.
  */
  it('is an error Payload shows the editor, not one it replaces with "Something went wrong."', async () => {
    const isErrorPublic = (error: { isPublic?: boolean; status?: number }) =>
      error.isPublic === true ||
      (error.isPublic !== false && Boolean(error.status) && error.status !== 500)

    const { req } = failingReq()
    const error = await refuseDeleteWhileReferenced('media', { noun: 'file' })({
      req,
      id: 5,
    } as never).catch((e: unknown) => e as { isPublic?: boolean; status?: number; message: string })

    expect(isErrorPublic(error!)).toBe(true)
    expect(error).toMatchObject({ status: 503, isPublic: true })
    expect(error!.message).toMatch(/tell a site administrator\.$/)
  })

  it('refuses the trash the same way', async () => {
    const { req } = failingReq()
    const hook = refuseTrashWhileReferenced('media')
    await expect(
      hook({
        req,
        operation: 'update',
        data: { deletedAt: 'now' },
        originalDoc: { id: 5 },
      } as never),
    ).rejects.toThrow(/Could not check/)
  })

  it('costs nothing on an ordinary edit', async () => {
    const { req } = failingReq()
    const data = { title: 'x' }
    const hook = refuseTrashWhileReferenced('media')
    await expect(
      hook({ req, operation: 'update', data, originalDoc: { id: 5 } } as never),
    ).resolves.toBe(data)
    expect(
      (req.payload as unknown as { find: ReturnType<typeof vi.fn> }).find,
    ).not.toHaveBeenCalled()
  })
})

describe('movesToTrash', () => {
  it('is a write that sets deletedAt where there was none', () => {
    expect(movesToTrash({ deletedAt: '2026-01-01' }, { deletedAt: null })).toBe(true)
    expect(movesToTrash({ deletedAt: '2026-01-01' }, {})).toBe(true)
  })

  it('is not a restore, an ordinary edit, or a write to something already trashed', () => {
    expect(movesToTrash({ deletedAt: null }, { deletedAt: '2026-01-01' })).toBe(false)
    expect(movesToTrash({ title: 'x' }, {})).toBe(false)
    expect(movesToTrash({ deletedAt: '2026-01-02' }, { deletedAt: '2026-01-01' })).toBe(false)
  })
})

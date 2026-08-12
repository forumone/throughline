import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildConfig, getPayload, type Payload } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { createBlockStatusWritesHook } from './block-status-writes.js'
import { createRecordDraftWritesHook } from './draft-writes.js'

/**
 * These run the hooks inside a real Payload instance against a real
 * database, rather than against our idea of what Payload passes them.
 *
 * That distinction has mattered: three separate defects in this hook came
 * from the unit tests encoding assumptions that Payload does not hold —
 * that `data` contains only the caller's changes (it is the stored document
 * merged with them), that a `draft: true` write leaves `_status` alone (it
 * is injected), and that `originalDoc` is the live document (it is the
 * latest version, which may be a draft on top of a live page).
 */

const BYPASS = { bypassPublishingServer: true }

let payload: Payload

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'integration-secret-integration-secret',
    db: sqliteAdapter({ client: { url: 'file::memory:?cache=shared' } }),
    collections: [
      {
        slug: 'pages',
        fields: [{ name: 'title', type: 'text' }],
        versions: { drafts: true },
        hooks: {
          beforeOperation: [createRecordDraftWritesHook()],
          beforeChange: [createBlockStatusWritesHook()],
        },
      },
    ],
    typescript: { outputFile: '/dev/null' },
    logger: { options: { level: 'silent' } },
  })
  payload = await getPayload({ config })
}, 60_000)

afterAll(async () => {
  await payload?.destroy?.()
})

async function makePage(status: 'draft' | 'published'): Promise<number | string> {
  const doc = await payload.create({
    collection: 'pages',
    data: { title: 'A page', _status: status },
  })
  return doc.id
}

function update(id: number | string, args: Record<string, unknown>) {
  return payload.update({ collection: 'pages', id, overrideAccess: true, ...args })
}

async function liveStatus(id: number | string): Promise<unknown> {
  return (await payload.findByID({ collection: 'pages', id }))._status
}

const BLOCKED = /Direct writes to `_status` are not allowed/

describe('the pipeline', () => {
  it('publishes and unpublishes through the bypass', async () => {
    const id = await makePage('draft')

    await update(id, { data: { _status: 'published' }, context: BYPASS })
    expect(await liveStatus(id)).toBe('published')

    await update(id, { data: { _status: 'draft' }, context: BYPASS })
    expect(await liveStatus(id)).toBe('draft')
  })

  it('survives repeated edit-then-publish rounds, as the admin drives it', async () => {
    const id = await makePage('draft')

    for (const round of [1, 2, 3]) {
      await update(id, { draft: true, data: { title: `Round ${round}` } })
      await update(id, { data: { _status: 'published' }, context: BYPASS })
    }

    expect(await liveStatus(id)).toBe('published')
    expect((await payload.findByID({ collection: 'pages', id })).title).toBe('Round 3')
  })
})

describe('draft saves', () => {
  it('saves a draft of a published document and leaves it live', async () => {
    const id = await makePage('published')

    await update(id, { draft: true, data: { title: 'Edited' } })

    expect(await liveStatus(id)).toBe('published')
  })

  it('saves repeatedly with a draft already pending', async () => {
    const id = await makePage('published')

    await update(id, { draft: true, data: { title: 'First' } })
    await update(id, { draft: true, data: { title: 'Second' } })

    expect(await liveStatus(id)).toBe('published')
  })

  it('saves a draft of a never-published document', async () => {
    const id = await makePage('draft')
    await expect(update(id, { draft: true, data: { title: 'Edited' } })).resolves.toBeDefined()
  })
})

describe('ordinary edits', () => {
  it('allows a non-draft field edit of a published document', async () => {
    const id = await makePage('published')

    await update(id, { data: { title: 'Renamed' } })

    expect(await liveStatus(id)).toBe('published')
  })

  it('allows a non-draft write to a never-published document', async () => {
    const id = await makePage('draft')
    await expect(update(id, { draft: false, data: { _status: 'draft' } })).resolves.toBeDefined()
  })
})

describe('unpublishing outside the pipeline', () => {
  it('is blocked on a live document', async () => {
    const id = await makePage('published')
    await expect(update(id, { draft: false, data: { _status: 'draft' } })).rejects.toThrow(BLOCKED)
    expect(await liveStatus(id)).toBe('published')
  })

  // The 0.3.2 defect: a draft save left `originalDoc._status` as 'draft'
  // while the document was still live, so the unpublish read as a no-op.
  it('is blocked after a draft save of the same document', async () => {
    const id = await makePage('published')
    await update(id, { draft: true, data: { title: 'Edited' } })

    await expect(update(id, { draft: false, data: { _status: 'draft' } })).rejects.toThrow(BLOCKED)
    expect(await liveStatus(id)).toBe('published')
  })

  it('is blocked after a draft save, a read and another draft save', async () => {
    const id = await makePage('published')
    await update(id, { draft: true, data: { title: 'One' } })
    await payload.findByID({ collection: 'pages', id })
    await update(id, { draft: true, data: { title: 'Two' } })

    await expect(update(id, { draft: false, data: { _status: 'draft' } })).rejects.toThrow(BLOCKED)
    expect(await liveStatus(id)).toBe('published')
  })

  // Payload merges the pending draft's `_status` into `data`, so a plain
  // non-draft edit would take the page down without ever naming `_status`.
  it('is blocked when it would happen implicitly via a plain edit', async () => {
    const id = await makePage('published')
    await update(id, { draft: true, data: { title: 'Pending' } })

    await expect(update(id, { data: { title: 'Oops' } })).rejects.toThrow(BLOCKED)
    expect(await liveStatus(id)).toBe('published')
  })
})

describe('publishing outside the pipeline', () => {
  it('is blocked for a draft document', async () => {
    const id = await makePage('draft')
    await expect(update(id, { draft: false, data: { _status: 'published' } })).rejects.toThrow(
      BLOCKED,
    )
    expect(await liveStatus(id)).toBe('draft')
  })

  // Live status stays 'published' throughout, so no status comparison can
  // see this — but it is what puts the pending draft in front of readers.
  it('is blocked when promoting a pending draft', async () => {
    const id = await makePage('published')
    await update(id, { draft: true, data: { title: 'Pending' } })

    await expect(update(id, { draft: false, data: { _status: 'published' } })).rejects.toThrow(
      BLOCKED,
    )
    expect((await payload.findByID({ collection: 'pages', id })).title).toBe('A page')
  })

  it('is blocked when the request also claims draft: true', async () => {
    const id = await makePage('draft')
    await expect(update(id, { draft: true, data: { _status: 'published' } })).rejects.toThrow(
      BLOCKED,
    )
    expect(await liveStatus(id)).toBe('draft')
  })
})

describe('rollback', () => {
  it('restores a version, as the MCP tool does', async () => {
    const id = await makePage('draft')
    await update(id, { draft: true, data: { title: 'First' } })
    const versions = await payload.findVersions({
      collection: 'pages',
      where: { parent: { equals: id } },
      limit: 1,
    })

    await expect(
      payload.restoreVersion({
        collection: 'pages',
        id: versions.docs[0]!.id,
        overrideAccess: true,
      }),
    ).resolves.toBeDefined()
  })
})

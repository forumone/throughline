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

/*
A database this file alone can see.

Both integration suites here used to open `file::memory:?cache=shared`, and
`cache=shared` scopes an in-memory SQLite database to that *name* rather than to
a connection — so two files opening it in one worker got the same tables. The
symptom was a write this file expects to be refused being allowed, roughly once
in several runs, which reads as a defect in the hook rather than as two suites
sharing a `pages` table.

`:memory:` is private to the client that opens it, which is one per test file.
The libSQL client `@payloadcms/db-sqlite` uses rejects `?mode=memory`, so a
distinct shared-cache name is not available as the alternative.
*/
const DATABASE_URL = ':memory:'

let payload: Payload

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'integration-secret-integration-secret',
    db: sqliteAdapter({ client: { url: DATABASE_URL } }),
    collections: [
      {
        slug: 'pages',
        fields: [{ name: 'title', type: 'text' }],
        versions: { drafts: true },
        trash: true,
        hooks: {
          beforeOperation: [createRecordDraftWritesHook()],
          beforeChange: [createBlockStatusWritesHook()],
        },
      },
    ],
    // Not `outputFile: '/dev/null'`, which still forks `payload generate:types`
    // in the background, where it hangs and outlives the run.
    typescript: { autoGenerate: false },
    logger: { options: { level: 'silent' } },
  })
  payload = await getPayload({ config })
}, 60_000)

afterAll(async () => {
  await payload?.destroy?.()
})

async function makePage(status: 'draft' | 'published'): Promise<number | string> {
  // A published create is a publish, so the setup makes one the way the
  // pipeline would.
  const doc = await payload.create({
    collection: 'pages',
    data: { title: 'A page', _status: status },
    ...(status === 'published' ? { context: BYPASS } : {}),
  })
  return doc.id
}

/*
Each write lands in a later millisecond than the one before. The hook judges a
write by the document's *latest version*, which Payload picks by timestamp; on
in-memory SQLite a create and an immediate draft edit can share a millisecond,
the tie picks the older version, and a write that should be blocked is not.
Failed about one run in two when this file ran alone. Two saves of one
document inside a millisecond is a test artefact, not something an editor can do.
*/
async function update(id: number | string, args: Record<string, unknown>) {
  await new Promise((resolve) => setTimeout(resolve, 2))
  return payload.update({ collection: 'pages', id, overrideAccess: true, ...args })
}

async function liveStatus(id: number | string): Promise<unknown> {
  return (await payload.findByID({ collection: 'pages', id }))._status
}

/**
 * The live document's title — what a reader of the published site would get.
 *
 * `findByID` with no `draft` reads the published row, which is the row
 * `if (!isSavingDraft)` leaves alone.
 */
async function liveTitle(id: number | string): Promise<unknown> {
  return (await payload.findByID({ collection: 'pages', id })).title
}

/** The latest version's title — what an editor previewing the draft would get. */
async function draftTitle(id: number | string): Promise<unknown> {
  return (await payload.findByID({ collection: 'pages', id, draft: true })).title
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

/*
The claim these make is the one editors actually ask about: **does saving a
draft publish the page?**

They used to answer it halfway. Each asserted `liveStatus` and stopped, which
says the document is still flagged published and says nothing about what is
*in* it — and "the live row was rewritten with the draft's content but kept its
status" is a failure that passes a status check. The publish-side tests two
describes down already read the live `title` for exactly that reason; these now
do too.

What makes the answer no is Payload's, not this hook's: `updateDocument` guards
the main-table write with `if (!isSavingDraft)`, so a draft save writes a
version row and nothing else. That is worth pinning here anyway. It is the
behaviour every access rule in a consuming app is written against — a public
read filtered to `_status: 'published'` is only safe because the published row
holds published content — and a Payload upgrade that changed it would otherwise
surface as drafts appearing on a live site rather than as a failing test.
*/
describe('draft saves', () => {
  it('saves a draft of a published document and leaves it live', async () => {
    const id = await makePage('published')

    await update(id, { draft: true, data: { title: 'Edited' } })

    expect(await liveStatus(id)).toBe('published')
    expect(await liveTitle(id)).toBe('A page')
    // And the draft really was stored, so this is isolation rather than a
    // write that quietly did nothing.
    expect(await draftTitle(id)).toBe('Edited')
  })

  it('saves repeatedly with a draft already pending', async () => {
    const id = await makePage('published')

    await update(id, { draft: true, data: { title: 'First' } })
    await update(id, { draft: true, data: { title: 'Second' } })

    expect(await liveStatus(id)).toBe('published')
    expect(await liveTitle(id)).toBe('A page')
    expect(await draftTitle(id)).toBe('Second')
  })

  /*
  Autosave, which is the write that actually happens. A host with
  `versions.drafts.autosave` on saves every couple of seconds while somebody
  types, so this is the draft write by volume — and it carries `autosave: true`
  alongside `draft: true`, a combination `isDraftWrite` does not look at and
  therefore ought to be held to.
  */
  it('autosaves a published document without publishing it', async () => {
    const id = await makePage('published')

    await update(id, { autosave: true, draft: true, data: { title: 'Typed halfway' } })

    expect(await liveStatus(id)).toBe('published')
    expect(await liveTitle(id)).toBe('A page')
  })

  it('saves a draft of a never-published document', async () => {
    const id = await makePage('draft')
    await expect(update(id, { draft: true, data: { title: 'Edited' } })).resolves.toBeDefined()

    // Still not live: the row exists, and `_status` is what a published-only
    // read rule filters on.
    expect(await liveStatus(id)).toBe('draft')
  })
})

describe('creating', () => {
  it('refuses a create that would be live at once', async () => {
    await expect(
      payload.create({
        collection: 'pages',
        data: { title: 'Straight to live', _status: 'published' },
      }),
    ).rejects.toThrow(/Create it as a draft, then publish it/)
  })

  it('creates a draft', async () => {
    const doc = await payload.create({ collection: 'pages', data: { title: 'A draft' } })
    expect(doc._status).toBe('draft')
  })
})

describe('edits to a live document', () => {
  it('refuses a non-draft field edit, and leaves the live content as it was', async () => {
    const id = await makePage('published')

    await expect(update(id, { data: { title: 'Renamed' } })).rejects.toThrow(/This page is live/)

    expect(await liveTitle(id)).toBe('A page')
  })

  it('allows a derived write, without the pipeline', async () => {
    const id = await makePage('published')

    await update(id, { data: { title: 'Annotated' }, context: { throughlineDerivedWrite: true } })

    expect(await liveStatus(id)).toBe('published')
    expect(await liveTitle(id)).toBe('Annotated')
  })

  it('does not let a derived write promote a pending draft', async () => {
    const id = await makePage('published')
    await update(id, { draft: true, data: { title: 'Pending' } })

    await expect(
      update(id, {
        data: { _status: 'published' },
        context: { throughlineDerivedWrite: true },
      }),
    ).rejects.toThrow(BLOCKED)
    expect(await liveTitle(id)).toBe('A page')
  })
})

describe('ordinary edits', () => {
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

describe('reverting to published', () => {
  /**
   * What Payload's Status component sends for "Revert to published": a read
   * of the live document at depth 0, written straight back with no draft
   * flag.
   */
  async function revert(id: number | string, edit: Record<string, unknown> = {}) {
    const live = await payload.findByID({ collection: 'pages', id, depth: 0 })
    return update(id, { data: { ...live, ...edit } })
  }

  it('discards a pending draft and leaves the live document as it was', async () => {
    const id = await makePage('published')
    await update(id, { draft: true, data: { title: 'Pending' } })

    await expect(revert(id)).resolves.toBeDefined()
    expect(await liveStatus(id)).toBe('published')
    expect(await liveTitle(id)).toBe('A page')
    expect(await draftTitle(id)).toBe('A page')
  })

  it('is blocked when the write changes the content it claims to restate', async () => {
    const id = await makePage('published')
    await update(id, { draft: true, data: { title: 'Pending' } })

    await expect(revert(id, { title: 'Something else' })).rejects.toThrow(BLOCKED)
    expect(await liveTitle(id)).toBe('A page')
  })

  it('is blocked on a document that was never published', async () => {
    const id = await makePage('draft')
    await update(id, { draft: true, data: { title: 'Pending' } })

    await expect(revert(id, { _status: 'published' })).rejects.toThrow(BLOCKED)
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

/*
The trash, as the admin drives it: moving a document there is a `PATCH` of
`{ deletedAt }` with no `draft` flag, and restoring one sends `deletedAt: null`
with `_status` set by the "restore as published" checkbox. Every read then
leaves a trashed document out, so trashing a live page takes it off the site —
which is why it is judged here at all.
*/
describe('the trash', () => {
  const trash = (id: number | string) =>
    update(id, { data: { deletedAt: new Date().toISOString() } })

  async function isTrashed(id: number | string): Promise<boolean> {
    const doc = await payload.findByID({ collection: 'pages', id, trash: true })
    return doc.deletedAt != null
  }

  it('refuses to trash a published document', async () => {
    const id = await makePage('published')

    await expect(trash(id)).rejects.toThrow(/Unpublish it first/)

    expect(await isTrashed(id)).toBe(false)
    expect(await liveStatus(id)).toBe('published')
  })

  it('refuses to trash a published document with a draft pending', async () => {
    const id = await makePage('published')
    await update(id, { draft: true, data: { title: 'Pending' } })

    await expect(trash(id)).rejects.toThrow(/Unpublish it first/)
    expect(await isTrashed(id)).toBe(false)
  })

  it('trashes a document that was never published', async () => {
    const id = await makePage('draft')

    await trash(id)

    expect(await isTrashed(id)).toBe(true)
  })

  it('trashes a document once it has been unpublished', async () => {
    const id = await makePage('published')
    await update(id, { data: { _status: 'draft' }, context: BYPASS })

    await trash(id)

    expect(await isTrashed(id)).toBe(true)
  })

  it('restores a trashed document as a draft', async () => {
    const id = await makePage('draft')
    await trash(id)

    await update(id, { trash: true, data: { deletedAt: null, _status: 'draft' } })

    expect(await isTrashed(id)).toBe(false)
    expect(await liveStatus(id)).toBe('draft')
  })

  // "Restore as published" is a publish, and a publish goes through the pipeline.
  // The restore dialog's own checkbox, so the refusal is worded for an editor.
  it('refuses to restore a trashed document straight to published, and says what to do', async () => {
    const id = await makePage('draft')
    await trash(id)

    await expect(
      update(id, { trash: true, data: { deletedAt: null, _status: 'published' } }),
    ).rejects.toThrow(/Restore it as a draft, then publish it/)
    expect(await isTrashed(id)).toBe(true)
  })

  // A document published at trash time can only get there around the pipeline
  // (the check above refuses the admin's route). Restoring it puts it back on
  // the site, which is a publish, so it gets the same answer as any other
  // restore straight to published.
  it('refuses to restore a document that was trashed while published', async () => {
    const id = await makePage('published')
    await update(id, {
      data: { deletedAt: new Date().toISOString() },
      context: BYPASS,
    })

    await expect(
      update(id, { trash: true, data: { deletedAt: null, _status: 'published' } }),
    ).rejects.toThrow(/Restore it as a draft, then publish it/)
    expect(await isTrashed(id)).toBe(true)
  })

  it('keeps the generic refusal for a direct publish that is not a restore', async () => {
    const id = await makePage('draft')
    await expect(update(id, { data: { _status: 'published' } })).rejects.toThrow(BLOCKED)
  })
})

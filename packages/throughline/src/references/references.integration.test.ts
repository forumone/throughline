import { sqliteAdapter } from '@payloadcms/db-sqlite'
import type { McpToolContext } from '../plugin-contract/index.js'
import { buildConfig, getPayload, type CollectionConfig, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMcpToolCollector } from '../mcp/collector.js'
import { findReferencedIds, findReferences } from './find.js'
import { USED_ON_FIELD, USED_ON_PANEL_PATH, referencesPlugin } from './plugin.js'
import { createCanDeleteTool, createFindReferencesTool } from './tools.js'

/*
The scan, the guards and the plugin against a real Payload and database.

`./walk.test.ts` proves the walk. This proves what surrounds it: that the
published and draft states are both read and counted once, that globals and
the target's own collection are covered, and that a delete or a trash Payload
itself performs is refused with the list.

Relationship fields rather than uploads, because an upload collection needs
files on disk and the walk treats the two alike. `:memory:` is private to this
file's client.
*/

const Assets: CollectionConfig = { slug: 'assets', fields: [{ name: 'title', type: 'text' }] }

const Terms: CollectionConfig = {
  slug: 'terms',
  trash: true,
  fields: [
    { name: 'title', type: 'text' },
    { name: 'parent', type: 'relationship', relationTo: 'terms' },
  ],
}

const Pages: CollectionConfig = {
  slug: 'pages',
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'hero', type: 'relationship', relationTo: 'assets' },
    { name: 'topics', type: 'relationship', relationTo: 'terms', hasMany: true },
    {
      name: 'layout',
      type: 'blocks',
      blocks: [
        {
          slug: 'Gallery',
          fields: [
            {
              name: 'items',
              type: 'array',
              fields: [{ name: 'image', type: 'relationship', relationTo: 'assets' }],
            },
          ],
        },
      ],
    },
  ],
}

const collector = createMcpToolCollector()
let payload: Payload

const editor: McpToolContext = {
  user: { id: '1', email: 'e@example.com', name: 'E', roles: ['editor'], groups: [] },
  apiKeyName: 'test',
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as McpToolContext['logger'],
}

async function asset(title: string) {
  return (await payload.create({ collection: 'assets', data: { title } })).id
}

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'test-secret-test-secret-test-secret',
    db: sqliteAdapter({ client: { url: ':memory:' } }),
    collections: [Assets, Terms, Pages],
    globals: [
      { slug: 'footer', fields: [{ name: 'logo', type: 'relationship', relationTo: 'assets' }] },
    ],
    plugins: [
      referencesPlugin({
        collections: [
          { slug: 'assets', noun: 'file' },
          {
            slug: 'terms',
            noun: 'term',
            panel: false,
            consequence: 'deleting it now would untag them without saying so',
          },
        ],
        mcpTools: collector,
      }),
    ],
    logger: { options: { level: 'silent' } },
    /*
    Outside production `getPayload` starts `payload generate:types` in the
    background, and with an inline config it never finishes: it outlives the
    test run, reparented to launchd, spinning a core.
    */
    typescript: { autoGenerate: false },
  })
  payload = await getPayload({ config })
}, 120_000)

afterAll(async () => {
  await payload?.destroy?.()
})

describe('findReferences', () => {
  it('finds a field, a block and a global, and says where', async () => {
    const id = await asset('shared')
    await payload.create({
      collection: 'pages',
      data: { title: 'Home', hero: id, _status: 'published' },
    })
    await payload.create({
      collection: 'pages',
      data: {
        title: 'Gallery page',
        layout: [{ blockType: 'Gallery', items: [{ image: id }] }],
        _status: 'published',
      },
    })
    await payload.updateGlobal({ slug: 'footer', data: { logo: id } })

    const found = await findReferences(payload, { collection: 'assets', id })
    const byLabel = Object.fromEntries(found.map((entry) => [entry.label, entry]))

    expect(Object.keys(byLabel).sort()).toEqual(['Footer', 'Gallery page', 'Home'])
    expect(byLabel['Home']?.viaBlock).toBe(false)
    expect(byLabel['Gallery page']?.references[0]?.path).toBe(
      'layout[0] › Gallery › items[0] › image',
    )
    expect(byLabel['Gallery page']?.viaBlock).toBe(true)
    expect(byLabel['Footer']?.global).toBe(true)

    await payload.updateGlobal({ slug: 'footer', data: { logo: null } })
  })

  it('finds a reference that exists only in a draft, and counts a document once', async () => {
    const id = await asset('draft-only')
    const page = await payload.create({
      collection: 'pages',
      data: { title: 'Draft', _status: 'published' },
    })
    await payload.update({ collection: 'pages', id: page.id, draft: true, data: { hero: id } })

    const found = await findReferences(payload, { collection: 'assets', id })
    expect(found.map((entry) => entry.label)).toEqual(['Draft'])
  })

  it("covers the target's own collection, without counting the document itself", async () => {
    const parent = await payload.create({ collection: 'terms', data: { title: 'Parent' } })
    await payload.create({ collection: 'terms', data: { title: 'Child', parent: parent.id } })

    const found = await findReferences(payload, { collection: 'terms', id: parent.id })
    expect(found.map((entry) => [entry.label, entry.references[0]?.path])).toEqual([
      ['Child', 'parent'],
    ])
  })

  it('collects every referenced id in one pass', async () => {
    const used = await asset('used')
    const unused = await asset('unused')
    await payload.create({
      collection: 'pages',
      data: { title: 'Uses one', hero: used, _status: 'published' },
    })

    const ids = await findReferencedIds(payload, 'assets')
    expect(ids.has(String(used))).toBe(true)
    expect(ids.has(String(unused))).toBe(false)
  })
})

describe('the guards, through Payload', () => {
  it('refuses to delete a document in use, and names the documents', async () => {
    const id = await asset('in use')
    await payload.create({
      collection: 'pages',
      data: {
        title: 'Uses it in a block',
        layout: [{ blockType: 'Gallery', items: [{ image: id }] }],
        _status: 'published',
      },
    })

    // forumone-2026#805: the collection's label and the place as the edit view
    // names it, not `pages › Uses it in a block (layout[0] › Gallery › …)`.
    await expect(payload.delete({ collection: 'assets', id })).rejects.toThrow(
      /This file is still used by 1 document\. Remove it there first, then delete it\.\n\n• Page › Uses it in a block \(Layout › Block 1 \(Gallery\) › Item 1 › Image\)\n[\s\S]*inside a block/,
    )
    expect(await payload.findByID({ collection: 'assets', id })).toMatchObject({ id })
  })

  it('lets a document nothing uses be deleted', async () => {
    const id = await asset('free')
    await payload.delete({ collection: 'assets', id })
    await expect(payload.findByID({ collection: 'assets', id })).rejects.toThrow()
  })

  it('refuses to move a document in use to the trash, with the consequence', async () => {
    const term = await payload.create({ collection: 'terms', data: { title: 'Topic' } })
    await payload.create({
      collection: 'pages',
      data: { title: 'Tagged', topics: [term.id], _status: 'published' },
    })

    await expect(
      payload.update({
        collection: 'terms',
        id: term.id,
        data: { deletedAt: new Date().toISOString() },
      }),
    ).rejects.toThrow(
      /then move it to the trash — deleting it now would untag them without saying so/,
    )
  })

  it('lets a document nothing uses go to the trash', async () => {
    const term = await payload.create({ collection: 'terms', data: { title: 'Lonely' } })
    const trashed = await payload.update({
      collection: 'terms',
      id: term.id,
      data: { deletedAt: new Date().toISOString() },
    })
    expect(trashed.deletedAt).toBeTruthy()
  })
})

describe('the plugin', () => {
  it('puts the panel first on a guarded collection, and only where asked', () => {
    const assets = payload.config.collections.find((c) => c.slug === 'assets')
    const terms = payload.config.collections.find((c) => c.slug === 'terms')
    const first = assets?.fields[0] as {
      name?: string
      admin?: { components?: { Field?: unknown } }
    }
    expect(first.name).toBe(USED_ON_FIELD)
    expect(first.admin?.components?.Field).toBe(USED_ON_PANEL_PATH)
    expect(terms?.fields.some((f) => 'name' in f && f.name === USED_ON_FIELD)).toBe(false)
  })

  it('declares and binds both tools', () => {
    expect(collector.servers).toContain('references')
    expect(collector.unbound).toEqual([])
    expect(collector.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['find_references', 'can_delete']),
    )
  })

  it('refuses a collection it was not given', async () => {
    await expect(
      buildConfig({
        secret: 'test-secret-test-secret-test-secret',
        db: sqliteAdapter({ client: { url: ':memory:' } }),
        collections: [Assets],
        plugins: [referencesPlugin({ collections: [{ slug: 'nope' }] })],
      }),
    ).rejects.toThrow(/no collection "nope"/)
  })
})

describe('the tools', () => {
  const deps = () => ({ payload, guarded: new Map([['assets', { noun: 'file' }]]) })

  it('find_references lists the documents', async () => {
    const id = await asset('tool target')
    await payload.create({
      collection: 'pages',
      data: { title: 'Tool page', hero: id, _status: 'published' },
    })

    const result = (await createFindReferencesTool(deps()).handler(
      { collection: 'assets', id },
      editor,
    )) as {
      count: number
      documents: { label: string; paths: string[] }[]
    }
    expect(result.count).toBe(1)
    expect(result.documents[0]).toMatchObject({ label: 'Tool page', paths: ['hero'] })
  })

  it('can_delete says no, with the refusal an editor would see', async () => {
    const id = await asset('kept')
    await payload.create({
      collection: 'pages',
      data: { title: 'Keeps it', hero: id, _status: 'published' },
    })

    const result = (await createCanDeleteTool(deps()).handler(
      { collection: 'assets', id },
      editor,
    )) as {
      canDelete: boolean
      guarded: boolean
      message: string
    }
    expect(result).toMatchObject({ canDelete: false, guarded: true })
    expect(result.message).toMatch(/^This file is still used by 1 document/)
  })

  it('can_delete says yes for a document nothing uses', async () => {
    const id = await asset('loose')
    expect(
      await createCanDeleteTool(deps()).handler({ collection: 'assets', id }, editor),
    ).toMatchObject({
      canDelete: true,
    })
  })

  it('refuses a caller without the role, and an unknown collection', async () => {
    const viewer = { ...editor, user: { ...editor.user!, roles: ['viewer'] } }
    expect(
      await createFindReferencesTool(deps()).handler({ collection: 'assets', id: 1 }, viewer),
    ).toHaveProperty('error')
    expect(
      await createCanDeleteTool(deps()).handler({ collection: 'nope', id: 1 }, editor),
    ).toEqual({
      error: 'There is no collection "nope".',
    })
  })
})

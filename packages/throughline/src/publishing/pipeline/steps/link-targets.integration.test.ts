import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig, getPayload, type CollectionConfig, type Field, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { markLinkTarget } from '../../../references/links.js'
import { makeContext } from '../_test-helpers.js'
import { linkTargetsStep } from './link-targets.js'

/*
The `link-targets` step against a real Payload and database
(forumone-2026#756). `./link-targets.test.ts` proves the verdicts against a
stub; this proves the reads the stub assumes: that `trash: true` brings a
trashed target back with its `deletedAt`, that `draft: false` gives the live
row's `_status` for a published page with a newer draft on top, that a schedule
is read from the latest draft, and that the document is read unpopulated so a
trashed target keeps its id.
*/

const link: Field = {
  name: 'href',
  type: 'group',
  fields: [
    { name: 'mode', type: 'radio', options: ['internal', 'external'], defaultValue: 'internal' },
    markLinkTarget({ name: 'reference', type: 'relationship', relationTo: ['pages', 'tags'] }),
    { name: 'url', type: 'text' },
  ],
}

const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  admin: { useAsTitle: 'title' },
  versions: { drafts: true },
  trash: true,
  fields: [
    { name: 'title', type: 'text' },
    { name: 'scheduledPublishAt', type: 'date' },
    {
      name: 'layout',
      type: 'blocks',
      blocks: [
        { slug: 'Cta', labels: { singular: 'Call to Action', plural: 'CTAs' }, fields: [link] },
      ],
    },
  ],
}

const Tags: CollectionConfig = {
  slug: 'tags',
  admin: { useAsTitle: 'name' },
  fields: [{ name: 'name', type: 'text' }],
}

let payload: Payload

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'test-secret-test-secret-test-secret',
    // As forumone-2026: a link in a block is an id in JSON, with no foreign key to null it.
    db: sqliteAdapter({ client: { url: ':memory:' }, blocksAsJSON: true }),
    collections: [Pages, Tags],
    logger: { options: { level: 'silent' } },
    // Outside production `getPayload` starts `payload generate:types`, which never finishes here.
    typescript: { autoGenerate: false },
  })
  payload = await getPayload({ config })
}, 120_000)

afterAll(async () => {
  await payload?.destroy?.()
})

async function page(data: Record<string, unknown>, published = false) {
  return (
    await payload.create({
      collection: 'pages',
      data: { ...data, _status: published ? 'published' : 'draft' },
      ...(published ? {} : { draft: true }),
    })
  ).id
}

const cta = (relationTo: string, value: unknown) => ({
  blockType: 'Cta',
  href: { mode: 'internal', reference: { relationTo, value } },
})

async function run(id: number | string) {
  const document = (await payload.findByID({ collection: 'pages', id, draft: true })) as Record<
    string,
    unknown
  >
  return linkTargetsStep(
    makeContext({
      payload,
      document,
      documentId: String(id),
      options: { collections: [{ slug: 'pages' }], inngest: {} as never },
    }),
  )
}

async function check(layout: unknown[]) {
  return run(await page({ title: 'Linking page', layout }))
}

describe('link-targets against a database', () => {
  it('passes a published page, a published page with a draft on top, and a tag', async () => {
    const live = await page({ title: 'Live' }, true)
    const revised = await page({ title: 'Revised' }, true)
    await payload.update({
      collection: 'pages',
      id: revised,
      data: { title: 'Revised again' },
      draft: true,
    })
    const tag = (await payload.create({ collection: 'tags', data: { name: 'Design' } })).id

    expect(await check([cta('pages', live), cta('pages', revised), cta('tags', tag)])).toEqual({
      pass: true,
    })
  })

  it('refuses a draft, a trashed page and a deleted one', async () => {
    const draft = await page({ title: 'Annual report' })
    const trashed = await page({ title: 'Old news' }, true)
    await payload.update({
      collection: 'pages',
      id: trashed,
      data: { deletedAt: new Date().toISOString() },
    })
    const deleted = await page({ title: 'Gone' }, true)
    const linking = await page({
      title: 'Linking page',
      layout: [cta('pages', draft), cta('pages', trashed), cta('pages', deleted)],
    })
    await payload.delete({ collection: 'pages', id: deleted })

    const result = await run(linking)

    expect(result.pass).toBe(false)
    expect(result.issues?.map((i) => [i.rule, i.field])).toEqual([
      ['draft', 'layout[0].href.reference'],
      ['trash', 'layout[1].href.reference'],
      ['deleted', 'layout[2].href.reference'],
    ])
    expect(result.issues?.[0]?.where).toBe('Block 1 (Call to Action)')
    expect(result.issues?.[0]?.message).toContain('This link goes to "Annual report"')
    expect(result.issues?.[1]?.message).toContain('"Old news", which is in the trash')
  })

  it('warns about a draft scheduled to publish, and does not block', async () => {
    const scheduled = await page({
      title: 'Launch',
      scheduledPublishAt: new Date(Date.now() + 86_400_000).toISOString(),
    })
    const result = await check([cta('pages', scheduled)])
    expect(result.pass).toBe(true)
    expect(result.warnings?.[0]).toContain('"Launch", which isn\'t published yet but is scheduled')
  })
})

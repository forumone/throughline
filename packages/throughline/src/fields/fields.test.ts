import { ValidationError, type Field, type FieldHook } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { mapFields } from './mapFields.js'
import { keepOrStampPublishedAt, publishedAtField, publishingFields } from './publishing.js'
import { contentRevisedAt, revisedAtField } from './revisedAt.js'
import { refuseSlugHeldInTrash, slugField, slugify } from './slug.js'
import { LISTED, unlistedField } from './unlisted.js'
import { usedBy } from './usedBy.js'

/*
The field kit, ported with its tests from forumone-2026. Each of these fields
was written because something went wrong quietly, so the tests are about the
quiet cases.
*/

type Hooked = Field & { hooks?: { beforeValidate?: FieldHook[]; beforeChange?: FieldHook[] } }

describe('slugify', () => {
  it('lowercases, hyphenates and trims', () => {
    expect(slugify('  About Us! ')).toBe('about-us')
    expect(slugify('A -- B')).toBe('a-b')
  })

  it('keeps an accented letter as its base letter rather than dropping it', () => {
    expect(slugify('Sécurité')).toBe('securite')
  })
})

describe('slugField', () => {
  const hook = (slugField() as Hooked).hooks!.beforeValidate![0]!
  const run = (value: unknown, data: Record<string, unknown>) =>
    hook({ value, data } as unknown as Parameters<FieldHook>[0])

  it('follows the title when left empty, and normalises what was typed', () => {
    expect(run('', { title: 'Our Work' })).toBe('our-work')
    expect(run('About Us!', { title: 'Something else' })).toBe('about-us')
  })

  it('follows another field when told to', () => {
    const fromName = (slugField({ from: 'name' }) as Hooked).hooks!.beforeValidate![0]!
    expect(fromName({ value: undefined, data: { name: 'Ada Lovelace' } } as never)).toBe(
      'ada-lovelace',
    )
  })

  it('is unique and indexed unless told otherwise', () => {
    expect(slugField()).toMatchObject({ name: 'slug', unique: true, index: true })
    expect(slugField({ unique: false })).not.toHaveProperty('unique')
  })
})

describe('refuseSlugHeldInTrash', () => {
  function run(slug: string, options: { holder?: Record<string, unknown>; originalSlug?: string }) {
    const find = vi.fn().mockResolvedValue({ docs: options.holder ? [options.holder] : [] })
    const hook = refuseSlugHeldInTrash('pages')
    const result = hook({
      data: { slug },
      originalDoc: options.originalSlug ? { slug: options.originalSlug } : undefined,
      req: { payload: { find } },
    } as unknown as Parameters<typeof hook>[0])
    return { find, result }
  }

  it('lets a slug through when nothing in the trash holds it, asking the trash', async () => {
    const { find, result } = run('about', {})
    await expect(result).resolves.toEqual({ slug: 'about' })
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { and: [{ slug: { equals: 'about' } }, { deletedAt: { exists: true } }] },
        trash: true,
      }),
    )
  })

  it('names the trashed document and the way out', async () => {
    const { result } = run('about', { holder: { title: 'About us', slug: 'about' } })
    await expect(result).rejects.toBeInstanceOf(ValidationError)
    await expect(result).rejects.toMatchObject({
      data: {
        errors: [
          {
            message:
              '/about belongs to "About us", which is in the trash. Restore it, or delete it permanently, to use this slug.',
          },
        ],
      },
    })
  })

  it('does not query when the slug has not changed, which autosave would do every two seconds', async () => {
    const { find, result } = run('about', { originalSlug: 'about' })
    await expect(result).resolves.toEqual({ slug: 'about' })
    expect(find).not.toHaveBeenCalled()
  })
})

describe('publishedAt', () => {
  function run(
    value: unknown,
    status: string | undefined,
    published: { publishedAt?: string } | null,
  ) {
    const req = { payload: { findByID: () => Promise.resolve(published) } }
    return Promise.resolve<unknown>(
      keepOrStampPublishedAt({
        value,
        data: status ? { _status: status } : {},
        originalDoc: { id: 9 },
        collection: { slug: 'pages' },
        req,
      } as unknown as Parameters<FieldHook>[0]),
    )
  }
  const recent = (stamp: unknown) =>
    typeof stamp === 'string' && Date.now() - Date.parse(stamp) < 5_000

  it('is stamped on the first publish of a document that has no date', async () => {
    expect(recent(await run(undefined, 'published', null))).toBe(true)
    expect(recent(await run(null, 'published', {}))).toBe(true)
  })

  it('keeps the first publish date when an open editor sends it back empty', async () => {
    const first = '2026-09-28T18:57:54.223Z'
    expect(await run(null, 'published', { publishedAt: first })).toBe(first)
  })

  it('keeps a date somebody entered', async () => {
    expect(await run('2019-04-02T00:00:00.000Z', 'published', null)).toBe(
      '2019-04-02T00:00:00.000Z',
    )
  })

  it('is left alone by a draft save', async () => {
    expect(await run(undefined, 'draft', null)).toBeUndefined()
  })

  it('is indexed unless the collection has no listing to sort', () => {
    expect(publishedAtField('x')).toMatchObject({ index: true })
    expect(publishedAtField('x', { index: false })).not.toHaveProperty('index')
    expect(publishingFields().map((field) => ('name' in field ? field.name : ''))).toEqual([
      'publishedAt',
      'scheduledPublishAt',
    ])
  })
})

describe('revisedAt', () => {
  const hook = (revisedAtField() as Hooked).hooks!.beforeChange![0]!
  const run = (args: Record<string, unknown>) => hook(args as unknown as Parameters<FieldHook>[0])

  it('is empty on create, so readers fall back to publishedAt', () => {
    expect(
      run({ operation: 'create', req: { user: { id: 1 } }, data: { _status: 'published' } }),
    ).toBeUndefined()
  })

  it('ignores a write with no user: a sync, a worker, a script', () => {
    expect(
      run({ operation: 'update', value: 'old', req: {}, data: { _status: 'published' } }),
    ).toBe('old')
  })

  it('ignores a draft save, which has not reached the URL', () => {
    expect(
      run({
        operation: 'update',
        value: 'old',
        req: { user: { id: 1 } },
        data: { _status: 'draft' },
      }),
    ).toBe('old')
  })

  it("stamps a person's published change", () => {
    const stamp = run({
      operation: 'update',
      value: 'old',
      req: { user: { id: 1 } },
      data: { _status: 'published' },
    })
    expect(typeof stamp === 'string' && Date.now() - Date.parse(stamp) < 5_000).toBe(true)
  })

  it('is read with the publish date as its fallback, and never updatedAt', () => {
    expect(contentRevisedAt({ revisedAt: '2026-01-02', publishedAt: '2025-01-01' })).toBe(
      '2026-01-02',
    )
    expect(contentRevisedAt({ publishedAt: '2025-01-01' })).toBe('2025-01-01')
    expect(contentRevisedAt({ revisedAt: 'not a date' })).toBeUndefined()
  })
})

describe('unlisted', () => {
  it('counts a row written before the column existed as listed', () => {
    expect(LISTED).toEqual({ unlisted: { not_equals: true } })
    expect(unlistedField()).toMatchObject({
      name: 'unlisted',
      type: 'checkbox',
      defaultValue: false,
    })
  })
})

describe('usedBy', () => {
  it('is a join, readable only when signed in unless told otherwise', () => {
    const field = usedBy({
      name: 'articles',
      label: 'Articles',
      collection: 'posts',
      on: 'authors',
      defaultColumns: [],
    })
    expect(field).toMatchObject({ type: 'join', collection: 'posts', on: 'authors' })
    const read = (field as { access: { read: (args: unknown) => boolean } }).access.read
    expect(read({ req: { user: null } })).toBe(false)
    expect(read({ req: { user: { id: 1 } } })).toBe(true)
  })
})

describe('mapFields', () => {
  it('reaches fields in groups, arrays, tabs and inline blocks', () => {
    const seen: string[] = []
    const fields: Field[] = [
      { name: 'g', type: 'group', fields: [{ name: 'a', type: 'text' }] },
      { type: 'tabs', tabs: [{ label: 'T', fields: [{ name: 'b', type: 'text' }] }] },
      {
        name: 'layout',
        type: 'blocks',
        blocks: [{ slug: 'X', fields: [{ name: 'c', type: 'text' }] }],
      },
    ]
    mapFields(fields, (field) => {
      if ('name' in field && field.type === 'text') seen.push(field.name)
      return field
    })
    expect(seen).toEqual(['a', 'b', 'c'])
  })
})

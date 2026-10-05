import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { makeContext } from '../_test-helpers.js'
import { imageUses, placeholderImagesStep } from './placeholder-images.js'

/* A page still using a placeholder image does not publish. forumone-2026#845. */

const blocks = [
  {
    slug: 'FeaturedWork',
    labels: { singular: 'Featured Work' },
    fields: [
      {
        name: 'items',
        type: 'array',
        labels: { singular: 'Item' },
        fields: [{ name: 'image', type: 'upload', relationTo: 'media' }],
      },
    ],
  },
]

const fields = [
  { name: 'heroImage', type: 'upload', relationTo: 'media' },
  { name: 'layout', type: 'blocks', blockReferences: ['FeaturedWork'] },
]

const document = {
  heroImage: { id: 1, url: '/a.jpg' },
  layout: [{ blockType: 'FeaturedWork', items: [{ image: 2 }, { image: 3 }] }],
}

function run(placeholderIds: number[], options: Record<string, unknown> = {}) {
  const find = vi.fn(async () => ({ docs: placeholderIds.map((id) => ({ id })) }))
  const payload = {
    find,
    collections: { pages: { config: { fields } } },
    config: { blocks },
  } as unknown as Payload
  const ctx = makeContext({ payload, document })
  return {
    find,
    result: placeholderImagesStep({
      ...ctx,
      options: { ...ctx.options, placeholderImages: { collection: 'media' }, ...options },
    }),
  }
}

describe('imageUses', () => {
  it('finds every image from the collection, at any depth, by path', () => {
    expect(imageUses(fields, document, 'media', blocks)).toEqual([
      { path: 'heroImage', id: 1 },
      { path: 'layout[0].items[0].image', id: 2 },
      { path: 'layout[0].items[1].image', id: 3 },
    ])
  })
})

describe('the placeholder-images step', () => {
  it('refuses a page using a placeholder, naming where', async () => {
    const { result, find } = run([3])
    const out = await result
    expect(out.pass).toBe(false)
    expect(out.issues).toEqual([
      expect.objectContaining({
        rule: 'placeholder-image',
        field: 'layout[0].items[1].image',
        message:
          'Block 1 (Featured Work) › Item 2 › Image is a placeholder. Replace it with the real image before publishing.',
      }),
    ])
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { and: [{ id: { in: [1, 2, 3] } }, { placeholder: { equals: true } }] },
        overrideAccess: true,
      }),
    )
  })

  it('passes a page with no placeholders', async () => {
    expect((await run([]).result).pass).toBe(true)
  })

  it('is off unless placeholderImages names the collection', async () => {
    const { result, find } = run([3], { placeholderImages: undefined })
    expect((await result).pass).toBe(true)
    expect(find).not.toHaveBeenCalled()
  })
})

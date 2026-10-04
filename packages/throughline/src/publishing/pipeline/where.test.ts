import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { makeContext } from './_test-helpers.js'
import { finishStep } from './finish.js'
import { blockLabel, describeFieldPath, fieldConfigFor, type FieldConfig } from './where.js'

/*
The shape Payload hands back for a sanitized collection, cut down to what a
description reads: labels, names, the containers that store their fields at
their parent's level, and blocks both inline and by reference.
*/
const imageHero = {
  slug: 'ImageHero',
  labels: { singular: 'Image Hero', plural: 'Image Heroes' },
  fields: [
    { name: 'heading', type: 'text', label: 'Heading' },
    { name: 'image', type: 'upload', label: 'Image' },
  ],
}
const cardGrid = {
  slug: 'CardGrid',
  labels: { singular: { en: 'Card Grid', fr: 'Grille' } },
  fields: [
    {
      name: 'items',
      type: 'array',
      label: 'Cards',
      labels: { singular: 'Card' },
      fields: [{ name: 'href', type: 'group', label: 'Link', fields: [{ name: 'url', type: 'text' }] }],
    },
  ],
}

const config: FieldConfig = {
  layoutField: 'layout',
  blocks: [cardGrid],
  fields: [
    { name: 'title', type: 'text', label: 'Title' },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [{ name: 'layout', type: 'blocks', label: 'Layout', blocks: [imageHero], blockReferences: ['CardGrid'] }],
        },
        {
          name: 'seo',
          label: 'SEO',
          fields: [{ name: 'title', type: 'text', label: 'Title' }, { name: 'metaDescription', type: 'textarea' }],
        },
      ],
    },
    { type: 'row', fields: [{ name: 'slug', type: 'text', label: 'Slug' }] },
    { name: 'speakers', type: 'relationship', label: 'Speakers' },
  ],
}

const document = {
  layout: [
    { blockType: 'CardGrid', items: [{ href: { url: '' } }, { href: { url: '' } }] },
    { blockType: 'Ghost' },
    { blockType: 'ImageHero', image: { id: 1 } },
  ],
}

describe('describeFieldPath', () => {
  it.each([
    ['layout[2].image', 'Content › Block 3 (Image Hero) › Image'],
    ['layout.2.image', 'Content › Block 3 (Image Hero) › Image'],
    ['layout[2]', 'Content › Block 3 (Image Hero)'],
    ['layout[0].items[1].href.url', 'Content › Block 1 (Card Grid) › Card 2 › Link › Url'],
    ['seo.title', 'SEO › Title'],
    ['seo.metaDescription', 'SEO › Meta description'],
    ['slug', 'Slug'],
    ['title', 'Title'],
    // Past a relationship is another document; the relationship is as far as this goes.
    ['speakers[0].portrait', 'Speakers'],
  ])('%s → %s', (path, expected) => {
    expect(describeFieldPath(path, config, document)).toBe(expected)
  })

  it('names a block of a type the config no longer has by its position alone', () => {
    expect(describeFieldPath('layout[1]', config, document)).toBe('Content › Block 2')
  })

  it('describes nothing it cannot find the start of', () => {
    expect(describeFieldPath('(root)', config, document)).toBeUndefined()
    expect(describeFieldPath('nope.title', config, document)).toBeUndefined()
  })
})

describe('blockLabel', () => {
  it('is the label the block has in the layout field, inline or by reference', () => {
    expect(blockLabel(config, 'ImageHero')).toBe('Image Hero')
    expect(blockLabel(config, 'CardGrid')).toBe('Card Grid')
  })

  it('falls back to the component’s display name', () => {
    expect(blockLabel(config, 'VideoHero')).toBe('Video Hero')
    expect(blockLabel(undefined, 'VideoHero')).toBe('Video Hero')
  })
})

describe('finishStep', () => {
  const payload = {
    collections: { pages: { config: { fields: config.fields } } },
    config: { blocks: config.blocks },
    logger: { error: vi.fn() },
  } as unknown as Payload

  it('adds where to each issue it can place, and leaves one it cannot', () => {
    const ctx = makeContext({ payload, document })
    expect(fieldConfigFor(ctx)?.fields).toBe(config.fields)
    const result = finishStep(ctx, 'accessibility', {
      pass: false,
      issues: [
        { field: 'layout[2].image', message: 'No alt text.', severity: 'error' },
        { message: 'Somewhere.', severity: 'error' },
        { field: 'seo.title', where: 'Already said', message: 'Kept.', severity: 'error' },
      ],
    })
    expect(result.issues?.map((i) => i.where)).toEqual([
      'Content › Block 3 (Image Hero) › Image',
      undefined,
      'Already said',
    ])
  })

  it('logs a detail, which the admin never shows', () => {
    const error = vi.fn()
    const ctx = makeContext({ payload: { logger: { error } } as unknown as Payload })
    finishStep(ctx, 'approval', {
      pass: false,
      code: 'approval-resolver-missing',
      detail: 'Register approvalsPlugin.',
    })
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('approval blocked pages/p1 (approval-resolver-missing): Register approvalsPlugin.'),
    )
  })

  it('leaves a result alone when Payload has no config to read', () => {
    const issues = [{ field: 'layout[0]', message: 'x', severity: 'error' as const }]
    expect(finishStep(makeContext(), 'composition', { pass: false, issues }).issues).toEqual(issues)
  })
})

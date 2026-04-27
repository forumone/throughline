import { describe, expect, it } from 'vitest'
import { requiredFieldsStep } from './required-fields.js'
import { makeContext } from '../_test-helpers.js'

describe('requiredFieldsStep', () => {
  const completeDoc = {
    seo: { title: 'My Page', description: 'A description for SEO previews and search.' },
    slug: 'my-page',
  }

  it('passes when SEO and slug are populated', async () => {
    const result = await requiredFieldsStep(makeContext({ document: completeDoc }))
    expect(result.pass).toBe(true)
  })

  it('fails when SEO title is missing', async () => {
    const result = await requiredFieldsStep(
      makeContext({
        document: { seo: { description: 'desc' }, slug: 'a' },
      }),
    )
    expect(result.pass).toBe(false)
    expect(result.issues?.some((i) => i.field === 'seo.title')).toBe(true)
  })

  it('fails when slug is missing or whitespace', async () => {
    const result = await requiredFieldsStep(
      makeContext({
        document: { seo: { title: 't', description: 'd' }, slug: '   ' },
      }),
    )
    expect(result.pass).toBe(false)
    expect(result.issues?.some((i) => i.field === 'slug')).toBe(true)
  })

  it('fails on per-collection requiredFields with empty values', async () => {
    const ctx = makeContext({
      collection: {
        slug: 'pages',
        layoutField: 'layout',
        seoField: 'seo',
        policyField: 'policy',
        slugField: 'slug',
        publishedAtField: 'publishedAt',
        scheduledPublishField: 'scheduledPublishAt',
        requiredFields: [{ path: 'meta.author', message: 'Author is required' }],
      },
      document: { ...completeDoc, meta: { author: '' } },
    })
    const result = await requiredFieldsStep(ctx)
    expect(result.pass).toBe(false)
    expect(result.issues?.[0]?.field).toBe('meta.author')
  })

  it('respects nested paths in requiredFields', async () => {
    const ctx = makeContext({
      collection: {
        slug: 'pages',
        layoutField: 'layout',
        seoField: 'seo',
        policyField: 'policy',
        slugField: 'slug',
        publishedAtField: 'publishedAt',
        scheduledPublishField: 'scheduledPublishAt',
        requiredFields: [{ path: 'meta.author', message: 'Author is required' }],
      },
      document: { ...completeDoc, meta: { author: 'Ada' } },
    })
    const result = await requiredFieldsStep(ctx)
    expect(result.pass).toBe(true)
  })
})

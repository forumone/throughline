import { describe, expect, it } from 'vitest'
import { altTextCheck } from './alt-text.js'
import { defaultCollection } from './_test-helpers.js'

describe('altTextCheck', () => {
  it('flags an image with missing alt', async () => {
    const issues = await altTextCheck.run(
      { hero: { image: { url: '/x.jpg', mimeType: 'image/jpeg' } } },
      defaultCollection,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.field).toContain('hero.image')
  })

  it('flags an image with empty alt', async () => {
    const issues = await altTextCheck.run(
      { image: { filename: 'x.jpg', alt: '   ' } },
      defaultCollection,
    )
    expect(issues).toHaveLength(1)
  })

  it('passes when alt is present and non-empty', async () => {
    const issues = await altTextCheck.run(
      { image: { filename: 'x.jpg', alt: 'A landscape' } },
      defaultCollection,
    )
    expect(issues).toEqual([])
  })

  it('does not flag non-image objects with a url', async () => {
    const issues = await altTextCheck.run(
      { link: { url: 'https://example.com', label: 'Read more' } },
      defaultCollection,
    )
    expect(issues).toEqual([])
  })

  it('skips objects with explicit non-image mimeType', async () => {
    const issues = await altTextCheck.run(
      { file: { url: '/doc.pdf', mimeType: 'application/pdf' } },
      defaultCollection,
    )
    expect(issues).toEqual([])
  })

  it('walks arrays and nested fields', async () => {
    const issues = await altTextCheck.run(
      {
        layout: [
          { blockType: 'media', image: { filename: 'a.jpg' } },
          { blockType: 'media', image: { filename: 'b.jpg', alt: 'ok' } },
        ],
      },
      defaultCollection,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.field).toContain('layout[0].image')
  })
})

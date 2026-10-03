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

  // Payload generates a `sizes` map on uploads with configured imageSizes.
  // Each derivative carries `filename` and `mimeType` but never `alt` —
  // that lives on the parent. Walking into them reported one false failure
  // per size, which blocked every page carrying a sized image.
  describe('Payload upload derivatives', () => {
    const sizedUpload = {
      id: '1',
      alt: 'A developer working at a screen',
      url: '/api/media/file/developer-at-a-screen.jpg',
      filename: 'developer-at-a-screen.jpg',
      mimeType: 'image/jpeg',
      width: 2400,
      height: 1260,
      sizes: {
        og: {
          url: '/api/media/file/developer-at-a-screen-1200x630.jpg',
          width: 1200,
          height: 630,
          mimeType: 'image/jpeg',
          filesize: 99902,
          filename: 'developer-at-a-screen-1200x630.jpg',
        },
        thumbnail: {
          url: '/api/media/file/developer-at-a-screen-400x300.jpg',
          width: 400,
          height: 300,
          mimeType: 'image/jpeg',
          filesize: 12043,
          filename: 'developer-at-a-screen-400x300.jpg',
        },
      },
    }

    it('passes a populated upload whose parent has alt text', async () => {
      const issues = await altTextCheck.run(
        { layout: [{ blockType: 'media', images: [{ src: sizedUpload }] }] },
        defaultCollection,
      )
      expect(issues).toEqual([])
    })

    it('still fails a sized upload whose parent has no alt, at the parent path', async () => {
      const { alt: _dropped, ...noAlt } = sizedUpload
      const issues = await altTextCheck.run(
        { layout: [{ blockType: 'media', images: [{ src: noAlt }] }] },
        defaultCollection,
      )

      expect(issues).toHaveLength(1)
      expect(issues[0]?.field).toBe('layout[0].images[0].src')
    })

    it('reports one issue per bad image, not one per generated size', async () => {
      const { alt: _dropped, ...noAlt } = sizedUpload
      const issues = await altTextCheck.run({ a: noAlt, b: noAlt }, defaultCollection)
      expect(issues).toHaveLength(2)
      expect(issues.map((i) => i.field)).toEqual(['a', 'b'])
    })

    it('does not skip a `sizes` key that is not an image derivative map', async () => {
      // `sizes` on a non-image object must still be walked — the skip is
      // scoped to objects that are themselves images.
      const issues = await altTextCheck.run(
        { product: { sizes: { large: { filename: 'swatch.jpg' } } } },
        defaultCollection,
      )
      expect(issues).toHaveLength(1)
      expect(issues[0]?.field).toBe('product.sizes.large')
    })

    it('behaves unchanged for an upload with no generated sizes', async () => {
      const issues = await altTextCheck.run(
        { image: { filename: 'plain.jpg', mimeType: 'image/jpeg' } },
        defaultCollection,
      )
      expect(issues).toHaveLength(1)
      expect(issues[0]?.field).toBe('image')
    })
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

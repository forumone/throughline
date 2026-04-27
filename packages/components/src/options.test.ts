import { describe, expect, it } from 'vitest'
import { validateOptions } from './options.js'

describe('validateOptions', () => {
  it('accepts an object manifest source', () => {
    const result = validateOptions({
      manifest: { type: 'object', manifest: {} as never },
    })
    expect(result.manifest.type).toBe('object')
  })

  it('accepts a url manifest source with refreshInterval', () => {
    const result = validateOptions({
      manifest: { type: 'url', url: 'https://example.com/m.json', refreshInterval: 3600 },
    })
    expect(result.manifest.type).toBe('url')
  })

  it('accepts a payload-collection source', () => {
    const result = validateOptions({
      manifest: { type: 'payload-collection', slug: 'manifest' },
    })
    expect(result.manifest.type).toBe('payload-collection')
  })

  it('throws on an unknown manifest source type', () => {
    expect(() =>
      validateOptions({ manifest: { type: 'rando' } as never }),
    ).toThrow(/Invalid componentsPlugin options/)
  })

  it('throws on an invalid url', () => {
    expect(() =>
      validateOptions({ manifest: { type: 'url', url: 'not-a-url' } }),
    ).toThrow(/Invalid componentsPlugin options/)
  })

  it('throws on a non-positive refreshInterval', () => {
    expect(() =>
      validateOptions({
        manifest: { type: 'url', url: 'https://example.com', refreshInterval: 0 },
      }),
    ).toThrow(/Invalid componentsPlugin options/)
  })

  it('accepts matching.strategy = tfidf with maxRecommendations', () => {
    const result = validateOptions({
      manifest: { type: 'object', manifest: {} as never },
      matching: { strategy: 'tfidf', maxRecommendations: 10 },
    })
    expect(result.matching?.maxRecommendations).toBe(10)
  })
})

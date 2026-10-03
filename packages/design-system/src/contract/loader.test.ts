import { describe, it, expect, vi, afterEach } from 'vitest'
import { LoadedManifest, loadManifest, loadManifestFromUrl } from './loader.js'
import { makeHeroContract, makeManifest } from './_fixtures.js'

describe('loadManifest', () => {
  it('returns a LoadedManifest when input is valid', () => {
    const loaded = loadManifest(makeManifest())
    expect(loaded).toBeInstanceOf(LoadedManifest)
  })

  it('throws a readable error when input is invalid', () => {
    expect(() => loadManifest({ bogus: true })).toThrow(/Invalid manifest/)
  })

  it('error message includes the path to each issue', () => {
    try {
      loadManifest(makeManifest({ contractVersion: '9.9.9' as never }))
      throw new Error('should have thrown')
    } catch (err) {
      expect((err as Error).message).toContain('contractVersion')
    }
  })
})

describe('LoadedManifest', () => {
  const loaded = loadManifest(
    makeManifest({
      components: {
        Hero: makeHeroContract(),
        Card: makeHeroContract({ name: 'Card', category: 'card' }),
      },
      tokens: [
        { name: 'color.brand.primary', value: '#112233', category: 'color' },
        { name: 'space.lg', value: '2rem', category: 'space' },
      ],
    }),
  )

  it('exposes the design system metadata', () => {
    expect(loaded.designSystem.name).toBe('test-ds')
  })

  it('exposes the contract version', () => {
    expect(loaded.contractVersion).toBe('1.0.0')
  })

  it('getComponent returns the contract when present', () => {
    expect(loaded.getComponent('Hero')?.name).toBe('Hero')
  })

  it('getComponent returns undefined when absent', () => {
    expect(loaded.getComponent('Nope')).toBeUndefined()
  })

  it('requireComponent throws when absent', () => {
    expect(() => loaded.requireComponent('Nope')).toThrow(/not found/)
  })

  it('listComponents returns every name', () => {
    expect(loaded.listComponents().sort()).toEqual(['Card', 'Hero'])
  })

  it('listByCategory filters correctly', () => {
    const heroes = loaded.listByCategory('hero')
    expect(heroes).toHaveLength(1)
    expect(heroes[0]?.name).toBe('Hero')
  })

  it('listCategories returns sorted unique categories', () => {
    expect(loaded.listCategories()).toEqual(['card', 'hero'])
  })

  it('listByGroup finds a component by its explicit group', () => {
    const grouped = loadManifest(
      makeManifest({
        components: {
          Hero: makeHeroContract(),
          Testimonials: makeHeroContract({
            name: 'Testimonials',
            category: 'section',
            group: 'proof',
          }),
        },
      }),
    )
    const proof = grouped.listByGroup('proof')
    expect(proof).toHaveLength(1)
    expect(proof[0]?.name).toBe('Testimonials')
  })

  it('listByGroup finds an ungrouped component by its category', () => {
    const heroes = loaded.listByGroup('hero')
    expect(heroes).toHaveLength(1)
    expect(heroes[0]?.name).toBe('Hero')
  })

  it('listGroups resolves group before category', () => {
    const grouped = loadManifest(
      makeManifest({
        components: {
          Hero: makeHeroContract(),
          Testimonials: makeHeroContract({
            name: 'Testimonials',
            category: 'section',
            group: 'proof',
          }),
          Steps: makeHeroContract({ name: 'Steps', category: 'section', group: 'narrative' }),
        },
      }),
    )
    expect(grouped.listGroups()).toEqual(['hero', 'narrative', 'proof'])
    expect(grouped.listCategories()).toEqual(['hero', 'section'])
  })

  it('getToken returns a token by name', () => {
    expect(loaded.getToken('space.lg')?.value).toBe('2rem')
  })

  it('getToken returns undefined for unknown names', () => {
    expect(loaded.getToken('nope')).toBeUndefined()
  })
})

describe('loadManifestFromUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches and returns a LoadedManifest on success', async () => {
    const manifest = makeManifest()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 })),
    )
    const loaded = await loadManifestFromUrl('https://example.com/manifest.json')
    expect(loaded.designSystem.name).toBe('test-ds')
  })

  it('throws on non-ok responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    )
    await expect(loadManifestFromUrl('https://example.com/manifest.json')).rejects.toThrow(
      /HTTP 404/,
    )
  })

  it('throws when the fetched body does not validate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ bogus: true }), { status: 200 })),
    )
    await expect(loadManifestFromUrl('https://example.com/manifest.json')).rejects.toThrow(
      /Invalid manifest/,
    )
  })
})

import type { Config } from 'payload'
import { describe, expect, it } from 'vitest'
import { createMcpToolCollector } from '../mcp/collector.js'
import { withPublishRequirements } from '../throughline.js'
import { assertContentOptions, contentPlugin } from './plugin.js'
import { CONTENT_READ_TOOL_DESCRIPTORS } from './tools.js'

const config = {
  collections: [
    {
      slug: 'pages',
      fields: [
        { type: 'tabs', tabs: [{ label: 'Content', fields: [{ name: 'title', type: 'text' }] }] },
        { name: 'slug', type: 'text' },
      ],
    },
    { slug: 'people', fields: [{ name: 'name', type: 'text' }] },
  ],
} as unknown as Config
const collections = config.collections as NonNullable<Config['collections']>

describe('contentPlugin', () => {
  it('declares its four tools as the config is built, so every key gets a checkbox for each', async () => {
    const mcpTools = createMcpToolCollector()
    await contentPlugin({ collections: { pages: { fields: ['title', 'slug'] } }, mcpTools })(config)
    expect(mcpTools.tools.map((tool) => tool.name)).toEqual(
      CONTENT_READ_TOOL_DESCRIPTORS.map((tool) => tool.name),
    )
    expect(mcpTools.servers).toEqual(['content'])
  })

  it('stops the boot on a misspelt field, naming it', () => {
    expect(() =>
      assertContentOptions({ collections: { pages: { fields: ['title', 'tittle'] } } }, collections),
    ).toThrow(/"pages" has no top-level field "tittle"/)
  })

  it('stops the boot on a collection or related kind that is not there', () => {
    expect(() =>
      assertContentOptions(
        {
          collections: { posts: { fields: ['title'] } },
          related: { clients: { collection: 'clients' } },
        },
        collections,
      ),
    ).toThrow(/no collection "posts".*related kind "clients" names no collection "clients"/)
  })

  it('checks at boot, against the finished config, not as the config is built', async () => {
    // A field a later plugin adds, as plugin-seo adds `meta`: not there yet, and no error.
    const built = await contentPlugin({ collections: { pages: { fields: ['title', 'meta'] } } })(
      config,
    )
    const withMeta = [
      {
        slug: 'pages',
        fields: [...collections[0]!.fields, { name: 'meta', type: 'group', fields: [] }],
      },
    ] as typeof collections
    const payload = {
      collections: Object.fromEntries(withMeta.map((c) => [c.slug, { config: c }])),
    }
    await expect(built.onInit!(payload as never)).resolves.toBeUndefined()
    // And without it, at boot, it stops.
    const without = { collections: { pages: { config: collections[0] } } }
    await expect(built.onInit!(without as never)).rejects.toThrow(/no top-level field "meta"/)
  })

  it('changes nothing when disabled', () => {
    const out = contentPlugin({ enabled: false, collections: { nope: { fields: [] } } })(config)
    expect(out).toBe(config)
  })
})

describe('withPublishRequirements', () => {
  it('says what the required-fields step will ask, then the site’s own', () => {
    const out = withPublishRequirements(
      { pages: { fields: ['title'], publishRequires: ['A hero image'] } },
      {
        seoField: 'meta',
        collectionOptions: {
          pages: { requiredFields: [{ path: 'intro', message: 'An intro is required' }] },
        },
      },
    )
    expect(out['pages']?.publishRequires).toEqual([
      'meta.title',
      'meta.description',
      'slug',
      'intro: An intro is required',
      expect.stringMatching(/^Alt text/),
      'A hero image',
    ])
  })

  it('leaves the collections as given when publishing is off', () => {
    const collections = { pages: { fields: ['title'] } }
    expect(withPublishRequirements(collections, undefined)).toEqual(collections)
  })
})

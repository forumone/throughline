import { describe, expect, it } from 'vitest'
import type { CollectionConfig, Config } from 'payload'
import type { Inngest } from 'inngest'
import { publishingPlugin } from './plugin.js'
import type { PublishingPluginOptions } from './options.js'

const inngest = { send: async () => ({}) } as unknown as Inngest

const Pages: CollectionConfig = {
  slug: 'pages',
  fields: [{ name: 'title', type: 'text' }],
  versions: { drafts: true },
}

const Users: CollectionConfig = { slug: 'users', auth: true, fields: [] }

function build(
  options: Partial<PublishingPluginOptions> = {},
  collections: CollectionConfig[] = [Pages, Users],
): Config {
  const incoming = { collections } as unknown as Config
  return publishingPlugin({
    collections: [{ slug: 'pages' }],
    inngest,
    ...options,
  })(incoming) as Config
}

function editComponents(config: Config, slug: string) {
  const collection = config.collections?.find((c) => c.slug === slug)
  return collection?.admin?.components?.edit
}

describe('publishingPlugin admin controls', () => {
  // Acceptance: a stock admin can publish with no host-side code.
  it('installs its own Publish and Unpublish controls on publishable collections', () => {
    const edit = editComponents(build(), 'pages')

    expect(edit?.PublishButton).toEqual({
      path: '@forumone/throughline-publishing/client',
      exportName: 'PublishButton',
      clientProps: { routePrefix: '/publishing', publishedAtField: 'publishedAt' },
    })
    expect(edit?.UnpublishButton).toEqual({
      path: '@forumone/throughline-publishing/client',
      exportName: 'UnpublishButton',
      clientProps: { routePrefix: '/publishing' },
    })
  })

  it('passes the collection its configured publishedAt field and route prefix', () => {
    const config = build({
      routePrefix: '/content-ops',
      collections: [{ slug: 'pages', publishedAtField: 'wentLiveAt' }],
    })

    expect(editComponents(config, 'pages')?.PublishButton).toMatchObject({
      clientProps: { routePrefix: '/content-ops', publishedAtField: 'wentLiveAt' },
    })
  })

  it('leaves collections it does not govern untouched', () => {
    expect(editComponents(build(), 'users')).toBeUndefined()
  })

  it('does not clobber a control the host set explicitly', () => {
    const hostButton = { path: './HostPublishButton' }
    const config = build({}, [
      { ...Pages, admin: { components: { edit: { PublishButton: hostButton } } } },
      Users,
    ])
    const edit = editComponents(config, 'pages')

    expect(edit?.PublishButton).toBe(hostButton)
    // The slot the host left alone still gets the plugin's control.
    expect(edit?.UnpublishButton).toMatchObject({ exportName: 'UnpublishButton' })
  })

  it('preserves other admin settings on the collection', () => {
    const config = build({}, [{ ...Pages, admin: { useAsTitle: 'title' } }, Users])
    const collection = config.collections?.find((c) => c.slug === 'pages')
    expect(collection?.admin?.useAsTitle).toBe('title')
  })

  it('installs nothing when adminComponents is false', () => {
    expect(editComponents(build({ adminComponents: false }), 'pages')).toBeUndefined()
  })
})

describe('publishingPlugin endpoints', () => {
  it('mounts the admin publish routes alongside the MCP route', () => {
    const paths = build().endpoints?.map((e) => e.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        '/publishing/publish',
        '/publishing/unpublish',
        '/publishing/mcp',
      ]),
    )
  })

  it('honours a custom route prefix', () => {
    const paths = build({ routePrefix: '/content-ops' }).endpoints?.map((e) => e.path)
    expect(paths).toEqual(
      expect.arrayContaining(['/content-ops/publish', '/content-ops/unpublish']),
    )
  })

  it('keeps host endpoints', () => {
    const incoming = {
      collections: [Pages],
      endpoints: [{ path: '/host', method: 'get', handler: () => new Response('ok') }],
    } as unknown as Config
    const config = publishingPlugin({ collections: [{ slug: 'pages' }], inngest })(
      incoming,
    ) as Config
    expect(config.endpoints?.map((e) => e.path)).toContain('/host')
  })
})

describe('publishingPlugin trust boundary', () => {
  it('still installs the status-write hook on publishable collections', () => {
    const collection = build().collections?.find((c) => c.slug === 'pages')
    expect(collection?.hooks?.beforeChange).toHaveLength(1)
  })

  it('returns the config untouched when disabled', () => {
    const incoming = { collections: [Pages] } as unknown as Config
    const config = publishingPlugin({
      collections: [{ slug: 'pages' }],
      inngest,
      enabled: false,
    })(incoming)
    expect(config).toBe(incoming)
  })
})

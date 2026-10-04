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

const Scheduled: CollectionConfig = {
  slug: 'pages',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'scheduledPublishAt', type: 'date', admin: { position: 'sidebar' } },
  ],
  versions: { drafts: true },
}

function scheduleField(config: Config) {
  const fields = config.collections?.find((c) => c.slug === 'pages')?.fields ?? []
  return fields.find((f) => 'name' in f && f.name === 'scheduledPublishAt') as
    | { admin?: { position?: string; components?: { Field?: unknown } } }
    | undefined
}

describe('publishingPlugin schedule control', () => {
  it('renders the scheduled-publish field as the Schedule control', () => {
    const field = scheduleField(build({ routePrefix: '/content-ops' }, [Scheduled, Users]))
    expect(field?.admin?.components?.Field).toEqual({
      path: '@forumone/throughline/client',
      exportName: 'SchedulePublishField',
      clientProps: { routePrefix: '/content-ops' },
    })
    // The host's own admin settings survive.
    expect(field?.admin?.position).toBe('sidebar')
  })

  it('leaves a host component in place', () => {
    const own = { ...Scheduled, fields: [{ name: 'scheduledPublishAt', type: 'date', admin: { components: { Field: '/own#Field' } } }] } as CollectionConfig
    expect(scheduleField(build({}, [own, Users]))?.admin?.components?.Field).toBe('/own#Field')
  })

  it('adds nothing to a collection that does not declare the field', () => {
    const fields = build().collections?.find((c) => c.slug === 'pages')?.fields
    expect(fields).toEqual(Pages.fields)
  })

  it('adds nothing when the admin controls are turned off', () => {
    const field = scheduleField(build({ adminComponents: false }, [Scheduled, Users]))
    expect(field?.admin?.components).toBeUndefined()
  })
})

describe('publishingPlugin admin controls', () => {
  // Acceptance: a stock admin can publish with no host-side code.
  it('installs its own Publish and Unpublish controls on publishable collections', () => {
    const edit = editComponents(build(), 'pages')

    expect(edit?.PublishButton).toEqual({
      path: '@forumone/throughline/client',
      exportName: 'PublishButton',
      clientProps: { routePrefix: '/publishing' },
    })
    expect(edit?.UnpublishButton).toEqual({
      path: '@forumone/throughline/client',
      exportName: 'UnpublishButton',
      clientProps: { routePrefix: '/publishing' },
    })
  })

  it('passes the configured route prefix to both controls', () => {
    const config = build({ routePrefix: '/content-ops' })

    expect(editComponents(config, 'pages')?.PublishButton).toMatchObject({
      clientProps: { routePrefix: '/content-ops' },
    })
    expect(editComponents(config, 'pages')?.UnpublishButton).toMatchObject({
      clientProps: { routePrefix: '/content-ops' },
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
    expect(build({ adminComponents: false }).admin?.components?.providers).toBeUndefined()
  })
})

// forumone-2026#805: after a failed save, the first invalid field.
describe('publishingPlugin go-to-first-error provider', () => {
  const provider = { path: '@forumone/throughline/client', exportName: 'FirstErrorProvider' }

  it('registers it admin-wide, after the host’s own providers, keeping the rest of admin', () => {
    const incoming = {
      collections: [Pages, Users],
      admin: { user: 'users', components: { providers: ['/host#Provider'] } },
    } as unknown as Config
    const config = publishingPlugin({ collections: [{ slug: 'pages' }], inngest })(incoming) as Config
    expect(config.admin?.components?.providers).toEqual(['/host#Provider', provider])
    expect(config.admin?.user).toBe('users')
  })

  it('registers it once, however many times the config passes through', () => {
    const plugin = publishingPlugin({ collections: [{ slug: 'pages' }], inngest })
    const twice = plugin(plugin({ collections: [Pages, Users] } as unknown as Config) as Config) as Config
    expect(twice.admin?.components?.providers).toEqual([provider])
  })

  it('can be turned off on its own', () => {
    expect(build({ goToFirstError: false }).admin?.components?.providers).toBeUndefined()
  })
})

describe('publishingPlugin endpoints', () => {
  it('mounts the admin publish routes', () => {
    const paths = build().endpoints?.map((e) => e.path)
    expect(paths).toEqual(
      expect.arrayContaining(['/publishing/publish', '/publishing/unpublish']),
    )
  })

  /*
  The admin controls are all this plugin serves. Its tools reach a client
  through the host's `mcpPlugin` on one `/api/mcp`, so an endpoint here ending
  in `/mcp` would be a second transport nobody points at — which is what was
  just deleted. Asserted as an absence because a re-added one would otherwise
  pass every other test in this file.
  */
  it('serves no MCP endpoint of its own', () => {
    const paths = build().endpoints?.map((e) => e.path) ?? []
    expect(paths.filter((path) => path.endsWith('/mcp'))).toEqual([])
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

  // The status-write hook cannot tell a draft save from an unpublish on its
  // own; it depends on the beforeOperation hook having recorded the draft
  // flag. Shipping one without the other blocks every edit to a published
  // document, which is exactly what happened in 0.3.1.
  it('installs the draft-write recorder alongside it', () => {
    const collection = build().collections?.find((c) => c.slug === 'pages')
    expect(collection?.hooks?.beforeOperation).toHaveLength(1)
  })

  // Without it a schedule is a date nothing wakes up for — which is what every
  // schedule set from the admin was before this hook existed.
  it('installs the scheduled-publish wake-up on publishable collections', () => {
    const collection = build().collections?.find((c) => c.slug === 'pages')
    expect(collection?.hooks?.afterChange).toHaveLength(1)
  })

  it('keeps host hooks on both arrays', () => {
    const config = build({}, [
      {
        ...Pages,
        hooks: {
          beforeOperation: [({ args }) => args],
          beforeChange: [({ data }) => data],
          afterChange: [({ doc }) => doc],
        },
      },
      Users,
    ])
    const collection = config.collections?.find((c) => c.slug === 'pages')
    expect(collection?.hooks?.beforeOperation).toHaveLength(2)
    expect(collection?.hooks?.beforeChange).toHaveLength(2)
    expect(collection?.hooks?.afterChange).toHaveLength(2)
  })

  it('leaves collections it does not govern without either hook', () => {
    const collection = build().collections?.find((c) => c.slug === 'users')
    expect(collection?.hooks?.beforeOperation).toBeUndefined()
    expect(collection?.hooks?.beforeChange).toBeUndefined()
    expect(collection?.hooks?.afterChange).toBeUndefined()
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

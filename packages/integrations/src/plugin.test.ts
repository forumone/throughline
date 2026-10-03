import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import type { Inngest } from 'inngest'
import { DEFAULT_ADMIN_GROUP } from '@forumone/throughline'
import { integrationsPlugin } from './plugin.js'
import { DEFAULT_INTEGRATIONS_SLUG, type IntegrationsPluginOptions } from './options.js'

const baseOptions: IntegrationsPluginOptions = { inngest: {} as Inngest }

function integrationsCollection(options: IntegrationsPluginOptions) {
  const config = integrationsPlugin(options)({ collections: [] } as unknown as Config) as Config
  return (config.collections ?? []).find((c) => c.slug === DEFAULT_INTEGRATIONS_SLUG)
}

describe('integrationsPlugin admin group', () => {
  it('puts its collection in the Throughline group by default', () => {
    expect(integrationsCollection(baseOptions)?.admin?.group).toBe(DEFAULT_ADMIN_GROUP)
  })

  it('passes a custom group through', () => {
    expect(integrationsCollection({ ...baseOptions, admin: { group: 'Admin' } })?.admin?.group).toBe(
      'Admin',
    )
  })

  it('leaves its collection ungrouped when group is false', () => {
    expect(integrationsCollection({ ...baseOptions, admin: { group: false } })?.admin).not.toHaveProperty(
      'group',
    )
  })
})

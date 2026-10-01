import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import type { Inngest } from 'inngest'
import { DEFAULT_ADMIN_GROUP } from '@forumone/throughline-plugin-contract'
import { approvalsPlugin } from './plugin.js'
import { DEFAULT_APPROVALS_SLUG } from './collection.js'
import type { ApprovalsPluginOptions } from './options.js'

const baseOptions: ApprovalsPluginOptions = {
  groups: [{ slug: 'editorial', name: 'Editorial' }],
  groupResolver: { resolveUsers: async () => [] },
  inngest: {} as Inngest,
  tokenSecret: 'x'.repeat(32),
}

function approvalsCollection(options: ApprovalsPluginOptions) {
  const config = approvalsPlugin(options)({ collections: [] } as unknown as Config) as Config
  return (config.collections ?? []).find((c) => c.slug === DEFAULT_APPROVALS_SLUG)
}

describe('approvalsPlugin admin group', () => {
  it('puts its collection in the Throughline group by default', () => {
    expect(approvalsCollection(baseOptions)?.admin?.group).toBe(DEFAULT_ADMIN_GROUP)
  })

  it('passes a custom group through', () => {
    expect(approvalsCollection({ ...baseOptions, admin: { group: 'Workflow' } })?.admin?.group).toBe(
      'Workflow',
    )
  })

  it('leaves its collection ungrouped when group is false', () => {
    expect(approvalsCollection({ ...baseOptions, admin: { group: false } })?.admin).not.toHaveProperty(
      'group',
    )
  })
})

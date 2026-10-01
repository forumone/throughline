import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import type { Inngest } from 'inngest'
import { DEFAULT_ADMIN_GROUP } from '@forumone/throughline-plugin-contract'
import { formsPlugin } from './plugin.js'
import type { FormsPluginOptions } from './options.js'

const baseOptions: FormsPluginOptions = {
  inngest: {} as Inngest,
  ipHashSecret: 'a'.repeat(32),
  allowedDestinations: [
    { type: 'email', value: 'team@example.com', description: 'Main inbox', label: 'Main inbox' },
  ],
}

function groupsOf(options: FormsPluginOptions) {
  const config = formsPlugin(options)({ collections: [] } as unknown as Config) as Config
  const bySlug = new Map((config.collections ?? []).map((c) => [c.slug, c]))
  return {
    forms: bySlug.get('forms')?.admin,
    submissions: bySlug.get('form-submissions')?.admin,
  }
}

describe('formsPlugin admin group', () => {
  it('puts both Form Builder collections in the Throughline group by default', () => {
    const { forms, submissions } = groupsOf(baseOptions)
    expect(forms?.group).toBe(DEFAULT_ADMIN_GROUP)
    expect(submissions?.group).toBe(DEFAULT_ADMIN_GROUP)
  })

  it('passes a custom group through to both', () => {
    const { forms, submissions } = groupsOf({ ...baseOptions, admin: { group: 'Content' } })
    expect(forms?.group).toBe('Content')
    expect(submissions?.group).toBe('Content')
  })

  it('leaves both ungrouped when group is false', () => {
    const { forms, submissions } = groupsOf({ ...baseOptions, admin: { group: false } })
    expect(forms).not.toHaveProperty('group')
    expect(submissions).not.toHaveProperty('group')
  })
})

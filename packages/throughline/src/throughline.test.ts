import type { CollectionConfig, Config } from 'payload'
import { OPS_TOOL_NAMES } from './authoring/descriptors.js'
import { describe, expect, it } from 'vitest'
import type { Integration } from './integrations/types.js'
import { inngestJobs } from './jobs/inngest/adapter.js'
import { payloadJobs } from './jobs/payload/adapter.js'
import { createFakeInngest } from './jobs/_test-helpers.js'
import { verifyActionToken } from './approvals/tokens.js'
import { signedActionUrl, throughline, type ThroughlineOptions } from './throughline.js'

/*
What `throughline()` decides for a site: which plugins load, in what order,
with which shared values, and which jobs the options call for. What each plugin
does is its own suite's business; these check the wiring.
*/

const users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
}
const pages: CollectionConfig = {
  slug: 'pages',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'slug', type: 'text' },
    { name: 'meta', type: 'group', fields: [{ name: 'title', type: 'text' }] },
  ],
  versions: { drafts: true },
}
const base = (): Config =>
  ({ collections: [users, pages], secret: 'x'.repeat(32), db: {} as Config['db'] }) as Config

const groupResolver = { resolveUsers: async () => [] }
const everything = (jobs = inngestJobs(createFakeInngest().inngest)): ThroughlineOptions => ({
  jobs,
  collections: ['pages'],
  admin: { group: 'Workflow' },
  publishing: { seoField: 'meta', urls: { pages: (slug) => `/${slug}` } },
  approvals: {
    collectionSlug: 'approval-requests',
    groups: [{ slug: 'editorial', name: 'Editorial' }],
    groupResolver,
    tokenSecret: 's'.repeat(32),
  },
  auditQuery: {},
  email: {
    apiKey: 'k',
    fromAddress: 'a@example.com',
    resolveApprover: async () => null,
    resolveRequester: async () => null,
  },
  integrations: {},
  references: { collections: [{ slug: 'pages', noun: 'page' }] },
  editorial: {},
  healthcheck: { checks: [] },
})

async function built(options: ThroughlineOptions) {
  const suite = throughline(options)
  const config = await suite.plugin(base())
  return { suite, config, slugs: (config.collections ?? []).map((c) => c.slug) }
}

describe('throughline()', () => {
  it('always registers audit, job failures and fields, and nothing else unasked', async () => {
    const { slugs, suite } = await built({
      jobs: inngestJobs(createFakeInngest().inngest),
      collections: ['pages'],
    })
    expect(slugs).toEqual(['users', 'pages', 'audit-events', 'job-failures'])
    expect(suite.jobs).toEqual([])
  })

  it('adds a plugin for each key present', async () => {
    const { slugs } = await built(everything())
    expect(slugs).toEqual(
      expect.arrayContaining(['audit-events', 'job-failures', 'approval-requests', 'integrations']),
    )
  })

  it('gives the shared approvals slug to the collection, and no default one appears', async () => {
    const { slugs } = await built(everything())
    expect(slugs).toContain('approval-requests')
    expect(slugs).not.toContain('approvals')
  })

  it('files every collection it adds under the suite group, unless a plugin says otherwise', async () => {
    const options = everything()
    options.integrations = { admin: { group: 'Admin' } }
    const { config } = await built(options)
    const group = (slug: string) =>
      (config.collections ?? []).find((c) => c.slug === slug)?.admin?.group
    expect(group('audit-events')).toBe('Workflow')
    expect(group('approval-requests')).toBe('Workflow')
    expect(group('integrations')).toBe('Admin')
    expect(group('job-failures')).toBe('Workflow')
  })

  it('serves the eight authoring tools, then the operations tools, and none of the module tools they replace', async () => {
    const { suite } = await built(everything())
    const names = suite.mcpTools.map((tool) => tool.name)
    expect(names.slice(0, 8)).toEqual([
      'find',
      'get',
      'save_draft',
      'edit_blocks',
      'check',
      'publish',
      'design_guide',
      'compose_section',
    ])
    for (const ops of ['list_job_failures', 'query_audit', 'list_integrations', 'find_references', 'list_pending_approvals']) {
      expect(names, ops).toContain(ops)
    }
    // Every served tool beyond the eight is an operations tool.
    expect(names.slice(8).every((name) => OPS_TOOL_NAMES.includes(name))).toBe(true)
    for (const replaced of ['request_approval', 'check_slug', 'list_my_work', 'create_draft', 'get_publish_status', 'insert_block']) {
      expect(names, replaced).not.toContain(replaced)
    }
  })

  it('offers the authoring workflows as prompts', () => {
    const suite = throughline(everything())
    expect(suite.mcpPrompts.map((prompt) => prompt.name)).toEqual([
      'draft_post',
      'build_landing_page',
      'get_ready_to_publish',
    ])
  })

  it('serves only the eight when the operations tools are off', async () => {
    const { suite } = await built({ ...everything(), mcp: { ops: false } })
    expect(suite.mcpTools).toHaveLength(8)
  })

  it('calls for every platform job the options imply, under the function ids they have always had', () => {
    const fake = createFakeInngest()
    const suite = throughline(everything(inngestJobs(fake.inngest)))
    expect(suite.jobs.map((job) => job.id)).toEqual([
      'revalidate-on-publish',
      'publish-at-scheduled-time',
      'execute-scheduled-publishes',
      'expire-stale-approvals',
      'audit-event-echo',
      'healthcheck',
      'notify-approval-request',
      'notify-approval-decision',
      'notify-approval-expired',
      'webhook-deliver',
      'webhook-manual-trigger',
    ])
    // And they build as Inngest functions, as the site's route will serve them.
    inngestJobs(fake.inngest).functions(suite.jobs)
    expect(fake.functions.map((fn) => fn.id)).toEqual(suite.jobs.map((job) => job.id))
  })

  it('leaves out revalidation without urls, and the backstop when asked', () => {
    const options = everything()
    options.publishing = { scheduling: { backstop: false } }
    const ids = throughline(options).jobs.map((job) => job.id)
    expect(ids).not.toContain('revalidate-on-publish')
    expect(ids).not.toContain('execute-scheduled-publishes')
    expect(ids).toContain('publish-at-scheduled-time')
  })

  it('registers its jobs itself on Payload Jobs', async () => {
    const { config } = await built(everything(payloadJobs()))
    const workflows = (config.jobs?.workflows ?? []).map((w) => w.slug)
    expect(workflows).toEqual(
      expect.arrayContaining(['expire-stale-approvals', 'audit-event-echo']),
    )
  })

  it('refuses an integration it could not run through the adapter, naming the fix', () => {
    const inngestOnly = { id: 'crm', createFunctions: () => [] } as unknown as Integration
    const options = everything()
    options.integrations = { integrations: [inngestOnly] }
    expect(() => throughline(options)).toThrow(/integration "crm".*createJobs/)
  })

  it('refuses email with no way to sign its approval links', () => {
    const options = everything()
    delete options.approvals
    expect(() => throughline(options)).toThrow(/buildActionUrl/)
  })
})

describe('the default approval link', () => {
  const secret = 's'.repeat(32)

  it("is signed with approvals' secret, on approvals' action route, and verifies", async () => {
    const url = await signedActionUrl({ tokenSecret: secret, publicUrl: 'https://example.org/' })({
      approvalId: 'a1',
      action: 'approve',
      approverId: 'u7',
    })
    expect(url.startsWith('https://example.org/api/approvals/action?token=')).toBe(true)
    const token = decodeURIComponent(new URL(url).searchParams.get('token') ?? '')
    const verified = await verifyActionToken(token, secret)
    expect(verified).toMatchObject({
      ok: true,
      token: { approvalId: 'a1', action: 'approve', approverId: 'u7' },
    })
  })

  it('reads the environment when approvals names neither, at the moment a link is built', async () => {
    const build = signedActionUrl({})
    process.env['APPROVAL_TOKEN_SECRET'] = secret
    process.env['NEXT_PUBLIC_SERVER_URL'] = 'https://env.example'
    try {
      const url = await build({ approvalId: 'a1', action: 'approve', approverId: 'u7' })
      expect(url.startsWith('https://env.example/api/approvals/action?token=')).toBe(true)
    } finally {
      delete process.env['APPROVAL_TOKEN_SECRET']
      delete process.env['NEXT_PUBLIC_SERVER_URL']
    }
    await expect(build({ approvalId: 'a1', action: 'approve', approverId: 'u7' })).rejects.toThrow(
      /APPROVAL_TOKEN_SECRET/,
    )
  })
})

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMcpToolCollector } from '../mcp/collector.js'
import { createListJobFailuresTool } from '../observability/tool.js'
import { jobFailuresPlugin } from '../observability/plugin.js'
import { getJobFailureWriter } from '../observability/plugin.js'
import { buildHealthcheckFailureReport, buildJobFailureReport } from '../observability/report.js'
import { hardenCoreCollections, LOCKED_DOCUMENTS_SLUG } from './coreCollections.js'

/*
The lock-table hardening and `list_job_failures`, against a real Payload. The
hardening is asserted against the real sanitized config because it depends on
Payload's slug: if Payload renames the collection, this fails rather than the
control silently lapsing.
*/

const collector = createMcpToolCollector()
let payload: Payload

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'test-secret-test-secret-test-secret',
    db: sqliteAdapter({ client: { url: ':memory:' } }),
    collections: [
      {
        slug: 'users',
        auth: true,
        fields: [
          {
            name: 'roles',
            type: 'select',
            hasMany: true,
            options: ['admin', 'editor', 'approver'],
          },
        ],
      },
      { slug: 'pages', fields: [{ name: 'title', type: 'text' }] },
    ],
    plugins: [jobFailuresPlugin({ mcpTools: collector })],
    logger: { options: { level: 'silent' } },
    // Otherwise getPayload forks `payload generate:types`, which hangs and outlives the run.
    typescript: { autoGenerate: false },
  }).then((sanitized) => hardenCoreCollections(sanitized))
  payload = await getPayload({ config })
}, 120_000)

afterAll(async () => {
  await payload?.destroy?.()
})

const access = (operation: 'create' | 'read' | 'update' | 'delete', roles: string[] | null) => {
  const locked = payload.config.collections.find((c) => c.slug === LOCKED_DOCUMENTS_SLUG)!
  return locked.access[operation]({ req: { user: roles ? { id: 1, roles } : null } } as never)
}

describe('hardenCoreCollections', () => {
  it('lets editors and admins take and release locks', () => {
    for (const op of ['create', 'read', 'update', 'delete'] as const) {
      expect(access(op, ['editor'])).toBe(true)
      expect(access(op, ['admin'])).toBe(true)
    }
  })

  it('refuses an approver, a role-less account and no user at all', () => {
    for (const op of ['create', 'read', 'update', 'delete'] as const) {
      expect(access(op, ['approver'])).toBe(false)
      expect(access(op, [])).toBe(false)
      expect(access(op, null)).toBe(false)
    }
  })

  it('takes another rule', async () => {
    const config = await buildConfig({
      secret: 'test-secret-test-secret-test-secret',
      db: sqliteAdapter({ client: { url: ':memory:' } }),
      collections: [{ slug: 'pages', fields: [] }],
      typescript: { autoGenerate: false },
    })
    hardenCoreCollections(config, { canLock: (user) => Boolean(user) })
    const locked = config.collections.find((c) => c.slug === LOCKED_DOCUMENTS_SLUG)!
    expect(locked.access.delete({ req: { user: { id: 1 } } } as never)).toBe(true)
  })

  it('throws, rather than doing nothing, when the collection is not there', () => {
    expect(() => hardenCoreCollections({ collections: [] } as never)).toThrow(
      /no "payload-locked-documents"/,
    )
  })
})

describe('list_job_failures', () => {
  const ctx = (roles: string[]) =>
    ({
      user: { id: '1', email: 'a@example.com', name: 'A', roles, groups: [] },
      apiKeyName: 'k',
      logger: console,
    }) as never

  beforeAll(async () => {
    const writer = getJobFailureWriter(payload)!
    // Written as the failure handlers write them, oldest first.
    await writer(
      buildJobFailureReport(
        { functionId: 'publish-at-scheduled-time', error: new Error('boom') },
        { now: new Date('2026-10-01T00:00:00.000Z') },
      ),
    )
    await writer(
      buildHealthcheckFailureReport([{ name: 'payload', details: 'timeout' }], {
        now: new Date('2026-10-02T00:00:00.000Z'),
      }),
    )
  })

  it('lists failures, most recent first, as an admin', async () => {
    const result = (await createListJobFailuresTool({ payload }).handler({}, ctx(['admin']))) as {
      total: number
      failures: { source: string }[]
    }
    expect(result.total).toBe(2)
    expect(result.failures.map((f) => f.source)).toEqual([
      'healthcheck',
      'publish-at-scheduled-time',
    ])
  })

  it('filters by source and kind', async () => {
    const tool = createListJobFailuresTool({ payload })
    const jobs = (await tool.handler({ kind: 'job' }, ctx(['admin']))) as {
      failures: { source: string }[]
    }
    expect(jobs.failures.map((f) => f.source)).toEqual(['publish-at-scheduled-time'])
    const one = (await tool.handler({ source: 'healthcheck' }, ctx(['admin']))) as { total: number }
    expect(one.total).toBe(1)
  })

  it('applies the collection’s read rule: an editor sees nothing', async () => {
    await expect(
      createListJobFailuresTool({ payload }).handler({}, ctx(['editor'])),
    ).rejects.toThrow()
  })

  it('is bound by the plugin', () => {
    expect(collector.unbound).toEqual([])
    expect(collector.tools.map((tool) => tool.name)).toContain('list_job_failures')
  })
})

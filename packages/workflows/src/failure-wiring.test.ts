import { describe, expect, it, vi } from 'vitest'
import { createAuditEventEchoFunction } from './audit-event-echo.js'
import { createExecuteScheduledPublishesFunction } from './execute-scheduled-publishes.js'
import { createExpireStaleApprovalsFunction } from './expire-stale-approvals.js'
import { createHealthcheckFunction } from './healthcheck.js'
import { createRevalidateOnPublishFunction } from './revalidate-on-publish.js'
import { createFakeInngest, createFakePayload } from './_test-helpers.js'

/*
That the option reaches the config, for every factory.

`failureOptions` is unit-tested next door; this is the wiring, which is the part
that goes wrong one factory at a time. Audit 06 F-09 is an absence finding, and
an absence comes back — the fifth factory somebody adds is the one that forgets,
and nothing about forgetting produces an error.

The fake `inngest` keeps the config object it was handed, so these read what
Inngest would read.
*/

const handler = vi.fn()

/** Every factory here, built with a terminal-failure handler. */
function build() {
  const fake = createFakeInngest()
  const payload = createFakePayload()
  const base = { inngest: fake.inngest, payload, onTerminalFailure: handler }

  createRevalidateOnPublishFunction({ ...base, revalidate: async () => {} })
  createExecuteScheduledPublishesFunction({
    ...base,
    collections: [{ slug: 'pages' }],
    publish: async () => ({ published: true }),
  })
  createExpireStaleApprovalsFunction({ ...base, collectionSlug: 'approval-requests' })
  createAuditEventEchoFunction({ inngest: fake.inngest, onTerminalFailure: handler })
  createHealthcheckFunction({ ...base, checks: [] })

  return fake.functions
}

const ALL = [
  'revalidate-on-publish',
  'execute-scheduled-publishes',
  'expire-stale-approvals',
  'audit-event-echo',
  'healthcheck',
]

describe('every workflow factory', () => {
  it('registers all five, so none is silently unwired below', () => {
    expect(build().map(fn => fn.id).sort()).toEqual([...ALL].sort())
  })

  it.each(ALL)('%s passes the terminal-failure handler to Inngest', id => {
    const fn = build().find(f => f.id === id)

    // Inngest's key is `onFailure`; ours is `onTerminalFailure`. If the rename
    // were missing, the config would carry a key Inngest ignores and the
    // failure would be silent again — with the host believing it was wired.
    expect(fn?.options['onFailure'], `${id} has no onFailure in its config`).toBe(handler)
  })
})

/*
The defaults, which are a claim about which of these functions race. Each one is
argued at its own call site; asserted here so that changing a default is a
visible act rather than a diff nobody reads.
*/
describe('default concurrency', () => {
  it('caps the three that read a set of rows and then act on it', () => {
    const byId = new Map(build().map(fn => [fn.id, fn.options]))

    // Two runs of either cron find the same due row and both act: a document
    // published twice, or a requester told twice that their approval lapsed.
    // The healthcheck is capped because two probes report one outage twice.
    expect(byId.get('execute-scheduled-publishes')?.['concurrency']).toBe(1)
    expect(byId.get('expire-stale-approvals')?.['concurrency']).toBe(1)
    expect(byId.get('healthcheck')?.['concurrency']).toBe(1)
  })

  it('leaves the two idempotent event handlers uncapped', () => {
    const byId = new Map(build().map(fn => [fn.id, fn.options]))

    // Revalidating twice is the same as once, and one audit row is one event —
    // so serialising these would put a queue in front of every publish and
    // every audited write, for no correctness gain.
    expect(byId.get('revalidate-on-publish')?.['concurrency']).toBeUndefined()
    expect(byId.get('audit-event-echo')?.['concurrency']).toBeUndefined()
  })

  it('lets a host override a default', () => {
    const fake = createFakeInngest()
    createExpireStaleApprovalsFunction({
      inngest: fake.inngest,
      payload: createFakePayload(),
      collectionSlug: 'approval-requests',
      concurrency: 5,
    })

    expect(fake.functions[0]?.options['concurrency']).toBe(5)
  })

  it('adds no key at all when neither the host nor the factory has an opinion', () => {
    const fake = createFakeInngest()
    createAuditEventEchoFunction({ inngest: fake.inngest })

    expect(Object.keys(fake.functions[0]?.options ?? {})).not.toContain('concurrency')
    expect(Object.keys(fake.functions[0]?.options ?? {})).not.toContain('onFailure')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createFakeInngest, createFakePayload } from '../_test-helpers.js'
import { createAuditEventEchoFunction } from '../audit-event-echo.js'
import { createExecuteScheduledPublishesFunction } from '../execute-scheduled-publishes.js'
import { createExpireStaleApprovalsFunction } from '../expire-stale-approvals.js'
import { createHealthcheckFunction } from '../healthcheck.js'
import { createPublishAtScheduledTimeFunction } from '../publish-at-scheduled-time.js'
import { createRevalidateOnPublishFunction } from '../revalidate-on-publish.js'

/*
What each factory registers with Inngest, frozen.

The snapshots were written from the factories as they were before they moved
onto `defineJob`, and the move must leave every one byte for byte. Inngest keys
a function's run history, in-flight sleeps and idempotency window on this
config, so a drift here would orphan runs already in production and nothing
would say so. Order of keys aside, a snapshot that changes is a decision to
re-key a function, and should be made on purpose.
*/

const onTerminalFailure = vi.fn()

function registered(build: (inngest: ReturnType<typeof createFakeInngest>['inngest']) => unknown) {
  const fake = createFakeInngest()
  build(fake.inngest)
  const options = fake.functions[0]?.options ?? {}
  // Sorted, so the snapshot records the config and not the order it was spread in.
  return Object.fromEntries(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)))
}

const payload = createFakePayload([]).payload

describe('factory registrations', () => {
  it('revalidate-on-publish', () => {
    expect(
      registered((inngest) =>
        createRevalidateOnPublishFunction({ inngest, payload, urlBuilders: {}, onTerminalFailure }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "id": "revalidate-on-publish",
        "onFailure": [MockFunction],
        "retries": 5,
        "triggers": [
          {
            "event": "content/page.published",
          },
          {
            "event": "content/page.unpublished",
          },
          {
            "event": "content/page.rolled_back",
          },
        ],
      }
    `)
  })

  it('execute-scheduled-publishes', () => {
    expect(
      registered((inngest) =>
        createExecuteScheduledPublishesFunction({
          inngest,
          payload,
          collections: [{ slug: 'posts' }],
          onTerminalFailure,
        }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "concurrency": 1,
        "id": "execute-scheduled-publishes",
        "onFailure": [MockFunction],
        "triggers": [
          {
            "cron": "*/5 * * * *",
          },
        ],
      }
    `)
  })

  it('publish-at-scheduled-time', () => {
    expect(
      registered((inngest) =>
        createPublishAtScheduledTimeFunction({
          inngest,
          payload,
          collections: [{ slug: 'posts' }],
          publish: vi.fn(),
          onTerminalFailure,
        }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "id": "publish-at-scheduled-time",
        "idempotency": "event.data.collection + ":" + event.data.id + ":" + event.data.scheduledFor",
        "onFailure": [MockFunction],
        "triggers": [
          {
            "event": "content/page.scheduled",
          },
        ],
      }
    `)
  })

  it('expire-stale-approvals', () => {
    expect(
      registered((inngest) =>
        createExpireStaleApprovalsFunction({ inngest, payload, onTerminalFailure }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "concurrency": 1,
        "id": "expire-stale-approvals",
        "onFailure": [MockFunction],
        "triggers": [
          {
            "cron": "0 2 * * *",
          },
        ],
      }
    `)
  })

  it('audit-event-echo', () => {
    expect(registered((inngest) => createAuditEventEchoFunction({ inngest, onTerminalFailure })))
      .toMatchInlineSnapshot(`
      {
        "id": "audit-event-echo",
        "onFailure": [MockFunction],
        "triggers": [
          {
            "event": "audit/event.recorded",
          },
        ],
      }
    `)
  })

  it('healthcheck', () => {
    expect(
      registered((inngest) =>
        createHealthcheckFunction({ inngest, payload, checks: [], onTerminalFailure }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "concurrency": 1,
        "id": "healthcheck",
        "onFailure": [MockFunction],
        "triggers": [
          {
            "cron": "*/15 * * * *",
          },
        ],
      }
    `)
  })

  it('takes a host concurrency over the default, as before', () => {
    expect(
      registered((inngest) =>
        createExpireStaleApprovalsFunction({ inngest, payload, concurrency: 3 }),
      ),
    ).toMatchObject({ concurrency: 3 })
  })
})

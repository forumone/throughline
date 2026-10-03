import type { Inngest, InngestFunction } from 'inngest'
import { describe, expect, it } from 'vitest'
import type { IntegrationContext } from '../../types.js'
import { createWebhookFunctions } from './functions.js'

/*
What the webhook integration registers with Inngest, frozen before it moved
onto `defineJob` and held unchanged after. See `jobs/function-ids.test.ts`
in `@forumone/throughline` for why a drift here matters.
*/

function registered(onFailure?: IntegrationContext['onFailure']) {
  const configs: Array<Record<string, unknown>> = []
  const inngest = {
    createFunction: (config: Record<string, unknown>) => {
      configs.push(config)
      return {} as InngestFunction.Any
    },
    send: async () => undefined,
  } as unknown as Inngest
  createWebhookFunctions({
    inngest,
    integrationsCollectionSlug: 'integrations',
    loadInstances: async () => [],
    updateStatus: async () => undefined,
    recordAudit: async () => undefined,
    ...(onFailure ? { onFailure } : {}),
  } as unknown as IntegrationContext)
  return configs.map((config) =>
    Object.fromEntries(Object.entries(config).sort(([a], [b]) => a.localeCompare(b))),
  )
}

describe('webhook registrations', () => {
  it('registers webhook-deliver and webhook-manual-trigger as before', () => {
    expect(registered()).toMatchInlineSnapshot(`
      [
        {
          "id": "webhook-deliver",
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
            {
              "event": "form/submission.received",
            },
            {
              "event": "approval/decided",
            },
          ],
        },
        {
          "id": "webhook-manual-trigger",
          "triggers": [
            {
              "event": "integration/manual-sync",
            },
          ],
        },
      ]
    `)
  })
})

describe('a terminal-failure handler', () => {
  /*
  The two ran with none, so a webhook delivery that exhausted its retries was
  silent: they were two of the five forumone-2026 functions with no "(failure)"
  registration. `integrationsPlugin` now gives every integration one, as
  `ctx.onFailure`.
  */
  it('is registered on both from the context, and changes nothing else', () => {
    const onFailure = async () => undefined
    const withHandler = registered(onFailure)
    expect(withHandler.map((config) => config['onFailure'])).toEqual([onFailure, onFailure])
    expect(withHandler.map(({ onFailure: _, ...rest }) => rest)).toEqual(registered())
  })
})

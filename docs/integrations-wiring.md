# Integrations and Inngest wiring

Integration modules contribute Inngest functions that need to be served by the client app's Inngest endpoint. The integrations plugin **does not** serve those functions itself; it only registers them in a process-local registry. The client app merges integration functions with its own in its Inngest handler.

## Why this isn't automatic

Payload plugins extend the Payload config — they don't have a hook for Next.js route handlers. The Inngest endpoint lives in `apps/<your-app>/src/app/api/inngest/route.ts` and takes a fixed `serve({ client, functions })` shape. Integration functions need to flow into that `functions` array, which means the plugin has to expose them, not register them itself.

A future helper (`wireInngest()` or similar) could close this gap. For now, the pattern is one short snippet documented here.

## Pattern

In your client app's Inngest endpoint:

```typescript
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import { coreFunctions } from '@/lib/inngest-functions'
import {
  getIntegrationRegistry,
  getIntegrationContext,
} from '@forumone/throughline-integrations'
import { getPayload } from 'payload'
import config from '@payload-config'

const payload = await getPayload({ config })
const registry = getIntegrationRegistry(payload)
const integrationContext = getIntegrationContext(payload)

const integrationFunctions =
  registry && integrationContext
    ? registry.list().flatMap((integration) => integration.createFunctions(integrationContext))
    : []

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...coreFunctions, ...integrationFunctions],
})
```

Notes:

- The two helpers (`getIntegrationRegistry`, `getIntegrationContext`) read from the Payload instance via Symbols. They return `undefined` if `integrationsPlugin` is not registered — the example above bails to an empty list in that case so the route still works in apps that haven't wired integrations yet.
- `createFunctions` may be called more than once (e.g. once during plugin init for logging and once here for serving). That's fine — Inngest function objects are inert until served, and the integration's `createFunctions` should be a pure factory.
- Integration functions are merged with core/app functions. Inngest deduplicates by id, so as long as integrations use unique ids (the registry enforces uniqueness already), the merged list is safe to serve.

## What integrations contribute

Each integration's `createFunctions(ctx)` returns the Inngest functions that integration adds. The webhook integration ships:

- `webhook-deliver` — subscribes to `content/page.published`, `content/page.unpublished`, `content/page.rolled_back`, `form/submission.received`, `approval/decided`. For each enabled instance whose `eventFilter` matches, posts the event to the configured URL with HMAC-SHA256 signing.
- `webhook-manual-trigger` — subscribes to `integration/manual-sync` (fired by the `trigger_sync` MCP tool). Posts a small test payload to the targeted instance.

Salesforce, Mailchimp, Slack, etc. integrations add their own Inngest functions following the same pattern.

## What if I'm not using the Inngest endpoint?

If your deployment doesn't run the Inngest dev server or production runtime, the integration functions are never invoked but everything else still works. The MCP tools (`list_integrations`, `get_integration_status`, etc.) operate purely against the Integrations collection. Configuration, observability, and audit work without Inngest; only delivery does not.

This is useful for staging environments where you want to inspect configuration without firing real webhooks.

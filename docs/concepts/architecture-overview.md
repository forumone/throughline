# Architecture overview

A Throughline project is one Next.js application running Payload CMS, plus an Inngest endpoint, plus a set of MCP tool servers reached through a single MCP endpoint. There is no separate backend — everything lives in `apps/web`.

"Server" here means a bounded set of tools and the plugin that owns them, not a
port or a route. Each plugin builds its tools at `onInit` and hands them to a
collector; the host passes that collector's array to `@payloadcms/plugin-mcp`,
which serves all of them on one endpoint.

## The runtime

```
                     ┌──────────────────────┐
                     │  Claude (or any MCP  │
                     │      client)         │
                     └──────────┬───────────┘
                                │ streamable HTTP + Bearer
                                ▼
       ┌────────────────────────────────────────────────────┐
       │  Next.js app routes  (apps/web/src/app/api)        │
       │                                                    │
       │  /api/mcp             every tool, one endpoint:    │
       │                         components  propose / validate
       │                         publishing  publish / schedule / rollback
       │                         approvals   request / decide / list
       │                         audit       query change history
       │                         forms       form definitions
       │                         integrations trigger / inspect
       │  /api/publishing/*    admin publish controls       │
       │  /api/approvals/action  approval link target       │
       │  /api/forms/submit    public form post             │
       │  /api/inngest         workflow webhook             │
       │  /admin               Payload admin UI             │
       │  /(frontend)          your published site          │
       └────────────────────┬───────────────────────────────┘
                            │
                  ┌─────────┼──────────┐
                  ▼         ▼          ▼
           ┌──────────┐ ┌────────┐ ┌──────────┐
           │ Postgres │ │Inngest │ │  Resend  │
           └──────────┘ └────────┘ └──────────┘
```

Everything in the dashed box is your project. Everything below it is infrastructure.

## What each set of tools does

Each row is a plugin's contribution to the one endpoint, not an endpoint of its own.

| Tools | Role |
| --- | --- |
| **Payload's own** | Generic CRUD: list collections, find/create/update/delete documents. The "what's in the database" surface. Off unless the host names collections in `mcpPlugin`. |
| **Components** | Reasons about your design system. Returns components matching an intent, validates that a layout satisfies the contract, surfaces anti-pattern violations. |
| **Publishing** | The trust boundary. Publishes drafts through a seven-stage policy pipeline. Direct `_status` writes through Payload MCP are blocked. |
| **Approvals** | Manages approval workflows. Resolves approver groups to users. Issues HMAC-signed action tokens for email-based decisions. |
| **Audit** | Read-only queries over the audit log. "Who changed what, when, and what was the result?" |
| **Forms** | Wraps Payload's Form Builder. Adds an allowlist for destinations, spam mitigation, IP-hashed submissions. |
| **Integrations** | A registry of `Integration` implementations (CRM, marketing automation, analytics). Each integration owns its config schema, healthcheck, and Inngest workers. |

## Why MCP, not REST or GraphQL

Claude is the primary consumer. MCP is what Claude speaks natively — JSON-RPC tools, schema-validated inputs, structured errors, capability discovery. Wrapping Payload as MCP makes it directly conversational rather than something Claude has to learn through prose API docs every conversation.

Existing REST and GraphQL endpoints aren't gone. Payload still exposes them. They're useful for your own backend code, the Inngest workers, and any non-Claude consumer. The MCP layer is additive.

## The publish pipeline

The single most-important code path. When Claude (or anything else) calls `publish` on the Publishing server, the request runs through seven stages:

1. **Exists** — the doc resolves; the caller has read access
2. **Composition** — the layout validates against your design system contract
3. **Accessibility** — registered checks pass
4. **Required fields** — collection-level required-for-publish fields populated
5. **Embargo** — `policy.embargoedUntil` has passed (or isn't set)
6. **Approval** — if `policy.requiresApproval`, an active approval exists
7. **Execute** — the actual update to `_status: 'published'`

Each stage that fails returns a structured error with a code. The Payload MCP cannot bypass this — its `update` operation rejects writes to the `_status` field on the configured collections. See [The trust boundary](the-trust-boundary.md) for the full design.

## Event flow

Side effects fan out through Inngest, not direct calls. When you publish a page:

```
publishingPlugin.publish()
  ├─ writes _status: 'published'
  ├─ writes audit event content.published
  └─ inngest.send('content/page.published')
                       │
                       └─ workflows package handlers:
                          ├─ revalidate the Next.js cache
                          ├─ fan out to integrations
                          └─ workflow X, Y, Z (added in your project)
```

Subscribers don't know about each other. Adding a new subscriber is `inngest.createFunction({ trigger: { event: 'content/page.published' }, ... })`. Removing one is deleting that file. See [Event-driven workflows](event-driven-workflows.md).

## Where client code lives vs. where core lives

Throughline core is intentionally generic. It doesn't know about Forum One or any specific client. Your client project picks up core and extends it with:

- Real collections (your content model)
- Real groups + a real `groupResolver` (your user/SSO mapping)
- Real allowlisted destinations (your forms can email/webhook)
- Real integrations (your CRM, your analytics)
- Optional brand layer on top of the reference design system, or your own DS that satisfies the same contract

The seam between core and project is a configuration boundary, not a fork. Upgrades come through `pnpm update` and changesets, not through patching core. See [Client-agnostic core](client-agnostic-core.md).

## Where to look in code

| Concern | File |
| --- | --- |
| Plugin order + wiring | `apps/web/src/payload.config.ts` |
| Inngest functions registered | `apps/web/src/app/api/inngest/route.ts` |
| The MCP endpoint | `POST /api/mcp`, served by `@payloadcms/plugin-mcp` — the host registers it with a collector's array, and each plugin fills that array at `onInit` |
| Audit log records | `audit-log` collection in Payload |
| Approval records | `approvals` collection |
| API keys | `payload-mcp-api-keys` collection, from `@payloadcms/plugin-mcp` |
| Design system manifest | wherever `componentsPlugin({ manifest })` points |

## Next reading

- [The trust boundary](the-trust-boundary.md) — the seven-stage pipeline in detail
- [Plugin composition](plugin-composition.md) — how plugins find and wait for each other
- [Event-driven workflows](event-driven-workflows.md) — the Inngest layer in depth

# @forumone/throughline-approvals

Conversational approval workflow server for Throughline. Provides the resolver the publishing server consumes plus MCP tools and email-action endpoints for requesting and responding to approvals.

## What this package provides

- **Approvals collection** with target / request / decision / workflow-state fields and indexes for the common queries.
- **Approval resolver** that the publishing server's `approvalStep` calls to check for active granted approvals (auto-attached on the Payload instance via Symbol — no manual wiring needed).
- **HMAC-signed action tokens** (`generateActionToken` / `verifyActionToken`) for inline-action emails. Single-use enforcement via the per-record `consumedTokens` array prevents replay.
- **HTTP action endpoint** at `/api/approvals/action` that handles email button clicks: verify token → confirmation page → record decision.
- **Five MCP tools**, handed to the host's collector at `onInit` and served by `@payloadcms/plugin-mcp` on one `/api/mcp`. Pass `mcpTools` or they reach nobody:

| Tool | Audit |
|---|---|
| `request_approval` | `approval.requested` |
| `respond_to_approval` | `approval.granted` / `.declined` / `.changes_requested` |
| `get_approval_status` | none (read-only) |
| `list_pending_approvals` | none (read-only) |
| `list_my_requests` | none (read-only) |

## Installation

```bash
pnpm add @forumone/throughline-approvals
```

Peers: `payload@^3.0.0`, `inngest@^4.0.0`. Required runtime peer: `@forumone/throughline-core` (audit log).

## Usage

```ts
import { buildConfig } from 'payload'
import { auditPlugin, createInngestClient } from '@forumone/throughline-core'
import { approvalsPlugin } from '@forumone/throughline-approvals'
import { publishingPlugin } from '@forumone/throughline-publishing'

const inngest = createInngestClient({ id: 'my-site' })

export default buildConfig({
  // collections, db, secret...
  plugins: [
    auditPlugin({ inngest }),
    approvalsPlugin({
      inngest,
      groups: [
        { slug: 'editorial', name: 'Editorial review' },
        { slug: 'legal', name: 'Legal review' },
      ],
      groupResolver: {
        async resolveUsers(slugs) {
          // Return users belonging to any of the listed groups.
          return payload.find({
            collection: 'users',
            where: { groups: { in: slugs } },
          })
        },
      },
      tokenSecret: process.env.APPROVAL_TOKEN_SECRET,
    }),
    publishingPlugin({
      inngest,
      collections: [{ slug: 'pages' }],
      // No `approvalResolver` is needed — approvalsPlugin attaches it
      // automatically via Symbol. Pass one explicitly only if you need
      // to override.
    }),
  ],
})
```

## Wiring with the publishing server

The publishing server's `approvalStep` does not require an `approvalResolver` in its options. When approvalsPlugin is registered, it attaches the resolver to the Payload instance under `Symbol.for('@forumone/throughline/approvals-resolver')`, and publishing's approval step looks it up at publish time.

If you need a custom resolver (e.g. you store approvals in an external system), pass `approvalResolver` directly to `publishingPlugin` — it takes precedence over the symbol lookup.

## Phase 1 semantics

- **First-decision-wins.** Multi-party approvals (e.g. legal AND communications must both approve) are deferred to Phase 2. The Phase 1 model handles "any one approver from the configured groups," which covers the most common case.
- **Approvals are tied to content, not to a timestamp.** `request_approval` stores `documentContentHash(document)` in `targetVersion`, and publishing's approval step recomputes the same hash from the document it is about to publish. So an approval granted against one draft does not apply to a subsequent edit — but it does survive a save that changed nothing, and it comes back if an edit is reverted.

  This is what lets **autosave and approvals both be on**. The binding used to be `updatedAt`, which moves on every save: an editor fixing a typo while an approver read the request invalidated the approval, and autosave did that every couple of seconds. See the note under `documentContentHash` in `@forumone/throughline-core` for what counts as content — in short, everything except `id`, `createdAt`, `updatedAt`, `_status` and the other storage bookkeeping, at every level of the document.

  Both sides must load the document the same way for the hashes to agree; both use `payload.findByID({ collection, id, draft: true })`. A populated relationship and a bare relationship id are different values, so a caller hashing a document fetched at a different depth would match nothing.
- **Action tokens are single-use, 14-day validity.** Once an approver clicks an action link, the token is appended to the request's `consumedTokens` array; reusing it returns an error.
- **Self-approval is blocked.** The respond_to_approval tool refuses if the caller is the requester.
- **Group resolution is configurable.** Clients define what "editorial" or "legal" means via the `groupResolver.resolveUsers` callback. Core does not hardcode group membership logic.

## Action endpoint

The plugin registers a GET endpoint at `${routePrefix}/action` (default `/api/approvals/action`) that accepts a `?token=` query param. Flow:

1. Verify the HMAC signature and check the token hasn't expired.
2. Load the approval; bail if it's already decided or the token has been consumed.
3. First hit: render a confirmation page. Second hit (with `?confirm=true`): record the decision, append the token to `consumedTokens`, fire `approval/decided`, write the audit record.

The confirmation page is intentionally minimal. Clients that want a branded action page can register their own endpoint that calls `verifyActionToken` and `previewVerification` directly — both are exported from the package entry point.

## The `_meta` payload

`request_approval` and `respond_to_approval` accept the framework's `_meta` payload (via `withMeta` from `@forumone/throughline-core`). Audit records carry the prompt and reasoning fields for later "why was this approved?" queries.

## Related packages

- `@forumone/throughline-core` — required peer; provides the audit log and MCP handler this plugin builds on
- `@forumone/throughline-publishing` — peer plugin that consumes the resolver this plugin attaches
- `@forumone/throughline-email` (C11) — will subscribe to `approval/requested` and `approval/decided` to send notifications

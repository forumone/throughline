# Approvals: `@forumone/throughline/approvals`

This was `/approvals` in 0.x; [`docs/spec/1.0-exports.md`](../../spec/1.0-exports.md) maps its imports.

Conversational approval workflow server for Throughline. Provides the resolver the publishing server consumes plus MCP tools and email-action endpoints for requesting and responding to approvals.

## What this package provides

- **Approvals collection** with target / request / decision / workflow-state fields and indexes for the common queries.
- **Approval resolver** that the publishing server's `approvalStep` calls to check for active granted approvals (auto-attached on the Payload instance via Symbol — no manual wiring needed).
- **HMAC-signed action tokens** (`generateActionToken` / `verifyActionToken`) for inline-action emails. Single-use enforcement via the per-record `consumedTokens` array prevents replay.
- **HTTP action endpoint** at `/api/approvals/action` that handles email button clicks: verify token → confirmation page → record decision.
- **Five MCP tools**, handed to the host's collector at `onInit` and served by `@payloadcms/plugin-mcp` on one `/api/mcp`. Pass `mcpTools` or they reach nobody:

| Tool                     | Audit                                                   |
| ------------------------ | ------------------------------------------------------- |
| `request_approval`       | `approval.requested`                                    |
| `respond_to_approval`    | `approval.granted` / `.declined` / `.changes_requested` |
| `get_approval_status`    | none (read-only)                                        |
| `list_pending_approvals` | none (read-only)                                        |
| `list_my_requests`       | none (read-only)                                        |

## Installation

Part of [`@forumone/throughline`](../throughline.md#installation), which lists the optional peers each subpath needs. `throughline({ approvals: { … } })` registers it, after the audit log; registered by hand, it needs `auditPlugin` from `/audit` first. `throughline()` also gives the email plugin and the expiry job the same `collectionSlug`.

## Usage

```ts
export const suite = throughline({
  jobs: inngestJobs(inngest),
  collections: ['pages'],
  publishing: {},
  approvals: {
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
    // tokenSecret falls back to APPROVAL_TOKEN_SECRET
    expiry: {}, // the expiry job's own options
  },
})
```

Publishing needs no `approvalResolver`: this plugin attaches one, and an explicit one would override it. `throughline()` gives the same `collectionSlug` to this collection, the emails and the expiry job. Registered by hand instead, it goes after `auditPlugin`, and takes `inngest` and `mcpTools` itself.

## Sidebar group

The approvals collection sits in the admin sidebar's `Throughline` group by default, or the suite's `admin` group. Pass `approvals: { admin: { group: 'Workflow' } }` to file it elsewhere, or `admin: { group: false }` to leave it ungrouped. Every Throughline plugin that declares a collection takes the same option — see [the reference](../throughline.md#admin-sidebar-group).

## Environment

`approvalsEnv` declares what the plugin reads from the environment and refuses to start without — `APPROVAL_TOKEN_SECRET`, 32+ characters, used when `tokenSecret` is omitted. Pass it to `assertEnvironment` from `@forumone/throughline` at the top of `payload.config.ts` and a missing secret is reported together with every other missing variable, instead of as this plugin's own error at init. The init check still runs, driven by the same declaration.

```ts
import { assertEnvironment } from '@forumone/throughline'
import { approvalsEnv } from '@forumone/throughline/approvals'

assertEnvironment(approvalsEnv /*, every other plugin's list, and the site's own */)
```

## Wiring with the publishing server

The publishing server's `approvalStep` does not require an `approvalResolver` in its options. When approvalsPlugin is registered, it attaches the resolver to the Payload instance under `Symbol.for('@forumone/throughline/approvals-resolver')`, and publishing's approval step looks it up at publish time.

If you need a custom resolver (e.g. you store approvals in an external system), pass `approvalResolver` directly to `publishingPlugin` — it takes precedence over the symbol lookup.

## Semantics

- **First-decision-wins.** Multi-party approvals (e.g. legal AND communications must both approve) are not supported. The model handles "any one approver from the configured groups," which covers the most common case.
- **Approvals are tied to content, not to a timestamp.** `request_approval` stores `documentContentHash(document)` in `targetVersion`, and publishing's approval step recomputes the same hash from the document it is about to publish. So an approval granted against one draft does not apply to a subsequent edit — but it does survive a save that changed nothing, and it comes back if an edit is reverted.

  This is what lets **autosave and approvals both be on**. The binding used to be `updatedAt`, which moves on every save: an editor fixing a typo while an approver read the request invalidated the approval, and autosave did that every couple of seconds. See the note under `documentContentHash` in `@forumone/throughline` for what counts as content — in short, everything except `id`, `createdAt`, `updatedAt`, `_status` and the other storage bookkeeping, at every level of the document.

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

`request_approval` and `respond_to_approval` accept the framework's `_meta` payload (via `withMeta` from `@forumone/throughline`). Audit records carry the prompt and reasoning fields for later "why was this approved?" queries.

## Related

- [`@forumone/throughline`](../throughline.md): `throughline()`, the audit log and the MCP setup this builds on
- [Publishing](publishing.md): consumes the resolver this plugin attaches
- [Email](email.md): sends the notifications for `approval/requested` and `approval/decided`
- Guide: [Configuring approvers](../../guides/configuring-approvers.md)

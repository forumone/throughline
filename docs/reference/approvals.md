# @forumone/throughline-approvals

The Approvals MCP server. Manages approval workflows: requesting, deciding, expiring. Resolves approver groups to actual users via your `groupResolver`. Issues HMAC-signed action tokens so approvers can decide via email links without logging in.

## Install

```bash
pnpm add @forumone/throughline-approvals
```

Peer dependencies: `payload@^3.0.0`, `inngest@^4.0.0`. Depends on `@forumone/throughline-core` and `@forumone/throughline-publishing` (for the resolver protocol).

## Public API

```typescript
import {
  approvalsPlugin,
  createApprovalsCollection,
  attachApprovalResolver,
  createApprovalResolver,
  generateActionToken,
  verifyActionToken,
  buildActionUrl,
  createActionEndpoint,
  DEFAULT_APPROVALS_SLUG,
  APPROVALS_RESOLVER_SYMBOL,
} from '@forumone/throughline-approvals'

import type {
  ApprovalsPluginOptions,
  ApproverGroup,
  GroupResolver,
  ResolvedApprover,
  CreateApprovalsCollectionOptions,
  CreateApprovalResolverOptions,
  CreateActionEndpointDeps,
  ActionToken,
  ActionTokenAction,
  VerifyOptions,
  VerifyResult,
} from '@forumone/throughline-approvals'
```

## `approvalsPlugin(options)`

```typescript
approvalsPlugin({
  inngest,                                   // required
  groups: ApproverGroup[],                   // required
  groupResolver: GroupResolver,              // required (often a stub at plugin time; closed over `payload` after onInit)
  collectionSlug?: string,                   // default 'approvals'
  expireAfter?: string,                      // ISO duration, default '14d'
  routePrefix?: string,                      // default '/approvals'
})
```

`ApproverGroup`:

```typescript
interface ApproverGroup {
  slug: string                               // 'editorial', 'legal', etc.
  name: string                               // human-readable
  description?: string
}
```

`GroupResolver`:

```typescript
interface GroupResolver {
  resolveUsers(groupSlugs: string[]): Promise<ResolvedApprover[]>
}

interface ResolvedApprover {
  id: string
  email: string
  name?: string
}
```

See [Configuring approvers](../guides/configuring-approvers.md) for three patterns of `GroupResolver`.

## MCP tools

| Tool | Required role | Purpose |
| --- | --- | --- |
| `request_approval` | `editor`, `admin` | Create an approval record; resolve groups; fire `approval/requested` |
| `list_approvals` | `editor`, `admin`, `approver` | List active or completed approvals, filterable by status / target / requester |
| `get_approval` | `editor`, `admin`, `approver` | Get one approval by ID |
| `decide_approval` | `approver`, `admin` | Grant / decline / request changes |
| `cancel_approval` | requester, `admin` | Withdraw a pending approval |
| `list_groups` | any | Returns configured groups + resolved user counts |

## Email action tokens

Approval emails include three URLs of the shape:

```
{NEXT_PUBLIC_SERVER_URL}/api/approvals/decision?token={hmac}&action={approve|decline|request-changes}
```

The token encodes `{ approvalId, userId, action, expiresAt }` and is HMAC-SHA256-signed with `APPROVAL_TOKEN_SECRET`.

```typescript
const token = generateActionToken({
  approvalId: '...',
  userId: '...',
  action: 'approve',
  ttl: '14d',
})

const url = buildActionUrl({ token, action: 'approve' })
// '?token=...&action=approve'

const verified = verifyActionToken(rawToken, { secret: process.env.APPROVAL_TOKEN_SECRET! })
if (verified.ok) {
  // verified.payload is the parsed token contents
}
```

`createActionEndpoint(deps)` returns the request handler that processes these URL clicks. `approvalsPlugin` registers it automatically at `/api/approvals/decision`.

## Approvals collection

`createApprovalsCollection(options)` returns the `CollectionConfig`. The plugin creates it; you don't usually call this directly. Schema:

```
{
  id, target: { collection, id, version },
  requesterUserId, approverGroupSlugs: string[],
  status: 'pending' | 'granted' | 'declined' | 'changes-requested' | 'cancelled' | 'expired',
  decidedByUserId?, decidedAt?, comment?,
  createdAt, expiresAt,
}
```

## Resolver wiring (the symbol)

The Publishing plugin reads `getActiveApproval` from a Symbol-keyed slot on the Payload instance:

```typescript
APPROVALS_RESOLVER_SYMBOL  // Symbol.for('@forumone/throughline-approvals/resolver')
```

`attachApprovalResolver(payload, options)` writes the resolver to that slot. The Publishing plugin's `approvalResolver` option, if present, takes precedence; otherwise it falls back to the symbol-keyed value.

The CLI scaffolder writes the `attachApprovalResolver(payload)` call into the `payload.config.ts` after `approvalsPlugin` runs, so plugin order Just Works for the common case.

## Events fired

| Event | When |
| --- | --- |
| `approval/requested` | `request_approval` succeeds |
| `approval/granted` | `decide_approval` with `action: 'approve'` |
| `approval/declined` | `decide_approval` with `action: 'decline'` |
| `approval/changes_requested` | `decide_approval` with `action: 'request-changes'` |
| `approval/cancelled` | `cancel_approval` succeeds |
| `approval/expired` | The Workflows package's cron sees a stale pending approval |

The Email plugin's workers subscribe to most of these.

## Capabilities registered

- `approvals` — the plugin is loaded
- `approval-resolver` — `attachApprovalResolver` has been called

## Common usage

```typescript
import { approvalsPlugin, attachApprovalResolver } from '@forumone/throughline-approvals'

approvalsPlugin({
  inngest,
  groups: [
    { slug: 'editorial', name: 'Editorial' },
    { slug: 'legal', name: 'Legal' },
  ],
  groupResolver: {
    async resolveUsers(groupSlugs) {
      const result = await payload.find({
        collection: 'users',
        where: { groups: { in: groupSlugs } },
      })
      return result.docs.map((u) => ({ id: String(u.id), email: u.email, name: u.name }))
    },
  },
}),

// In onInit (or after the plugins are wired):
attachApprovalResolver(payload)
```

## Related

- Guide: [Configuring approvers](../guides/configuring-approvers.md)
- Concept: [The trust boundary](../concepts/the-trust-boundary.md) — stage 6 calls into this plugin
- Reference: [@forumone/throughline-publishing](publishing.md), [@forumone/throughline-email](email.md)

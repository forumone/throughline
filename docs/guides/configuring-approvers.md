# Configuring approvers

Goal: tell Throughline who can approve what. The Approvals plugin ships with a stub `groupResolver` that returns no users — it must be replaced before the approval flow does anything useful.

## What an approver group is

Throughline approvals are group-based, not user-based. A page's `policy.approverGroups` says "this page needs approval from `editorial`," not "this page needs approval from Ada." The mapping from group to users runs at request time through your `groupResolver`.

This indirection lets you change who's on a team without re-tagging content. Move Ada off `editorial` to `legal`, and tomorrow's pages with `policy.approverGroups: ['editorial']` route to whoever's currently on `editorial`.

## 1. Define the groups

In `apps/web/src/payload.config.ts`:

```typescript
approvalsPlugin({
  inngest,
  groups: [
    { slug: 'editorial', name: 'Editorial', description: 'Copy + voice review' },
    { slug: 'legal', name: 'Legal', description: 'Compliance + legal review' },
    { slug: 'communications', name: 'Communications', description: 'PR + brand voice' },
    { slug: 'senior', name: 'Senior leadership', description: 'CEO + founders' },
  ],
  groupResolver: { /* see below */ },
}),
```

Group slugs become the values listed in collections' `policy.approverGroups` select. Add them everywhere that select appears.

## 2. Decide the user-to-group mapping

You have three reasonable patterns:

### Option A: a `groups` field on the user

The scaffolded `users` collection includes:

```typescript
{
  name: 'groups',
  type: 'select',
  hasMany: true,
  options: ['editorial', 'legal', 'communications', 'senior'],
},
```

The simplest model. An admin assigns users to groups in the Payload admin. The resolver queries the users collection.

```typescript
groupResolver: {
  async resolveUsers(groupSlugs) {
    const result = await payload.find({
      collection: 'users',
      where: {
        groups: { in: groupSlugs },
      },
      limit: 1000,
    })
    return result.docs.map((user) => ({
      id: String(user.id),
      email: user.email,
      name: user.name ?? user.email,
    }))
  },
},
```

> [!NOTE]
> The `groupResolver` doesn't have direct access to the Payload instance unless you pass it in. The scaffold defaults this to a closure that captures `payload` after `getPayload({ config })` resolves. See `apps/web/src/payload.config.ts` after running the CLI.

### Option B: a separate `groups` collection

When group membership is non-trivial — different per-content-type, time-bound, or driven by other fields — model groups as a collection:

```typescript
{
  slug: 'groups',
  fields: [
    { name: 'slug', type: 'text', required: true, unique: true },
    { name: 'name', type: 'text', required: true },
    { name: 'members', type: 'relationship', relationTo: 'users', hasMany: true },
  ],
}
```

Resolver:

```typescript
async resolveUsers(groupSlugs) {
  const groups = await payload.find({
    collection: 'groups',
    where: { slug: { in: groupSlugs } },
    depth: 2, // expand the members relationship
  })
  const users = groups.docs.flatMap((group) => group.members ?? [])
  // de-duplicate; one user can be in multiple matching groups
  const seen = new Set<string>()
  return users.filter((u) => {
    const id = String(u.id)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  }).map((user) => ({
    id: String(user.id),
    email: user.email,
    name: user.name ?? user.email,
  }))
},
```

### Option C: SSO group sync

When users authenticate via SSO and group membership is the source of truth in your identity provider (Okta, Azure AD, etc.):

- The SSO provider syncs group membership into a user attribute (often `groups: ['editorial', 'legal']`)
- Your auth integration stores that attribute on the user record on each login
- The resolver reads the same field as Option A

The mechanics are the same as Option A; the difference is who maintains the membership.

> [!NOTE]
> SSO is a Phase 2 expansion. Throughline core doesn't ship a built-in SSO integration. See [Phase 2 expansions](../operations/phase-2-expansions.md).

## 3. Test the resolver

```
List active approval groups.
```

Claude calls `list_groups` on the Approvals MCP. The result shows each group plus the count of resolved users.

```
Who's in editorial?
```

```
Request approval from editorial for page X.
```

Watch the Inngest dashboard for `notify-approval-request` runs — one per approver. Each approver receives an email with three signed action buttons.

If the resolver returns no users for a group, the approval still succeeds (no-op). The audit log records `approval.requested-no-recipients` so you can detect orphan groups.

## 4. Approval rules of thumb

- **Default `requiresApproval` to `false`.** Make it opt-in per page, not opt-out. Most content shouldn't require approval; the gate is for high-stakes pages.
- **Don't use `requiresApproval` for "who can edit."** That's a role-based access control (RBAC) decision, handled by Payload's collection-level `access` config, not by approvals. Editors can edit; approvers gate publish.
- **Approver != editor.** The Approver role grants the user *only* the ability to grant/deny approvals on assigned content. They can't necessarily edit content; that's an `editor` or `admin` role.
- **Multiple groups means *any of them*, not all.** A page with `approverGroups: ['editorial', 'legal']` publishes after either group grants. Use a single group when you need single-source approval.
- **Approvals expire.** The `createExpireStaleApprovalsFunction` workflow runs daily; stale approvals (default: 14 days) get auto-expired and the requester gets an email. Tune via `approvalsPlugin({ expireAfter: '30d' })`.

## 5. Roles vs groups

Throughline distinguishes:

- **Roles** (`admin`, `editor`, `approver`, `form-admin`) — what you can *do* in the system
- **Groups** (`editorial`, `legal`, ...) — content workflow assignments; orthogonal to roles

A user can be `admin` (does anything) and also a member of `editorial` (gets approval requests for editorial-tagged content). A user can be `approver` only for the `legal` group, in which case they can only act on legal-tagged approvals.

The `approver` role is the gate to *deciding* approvals via MCP. Email actions, signed via the `APPROVAL_TOKEN_SECRET`, work without the role — the URL itself is the credential.

## Where to look in code

- `packages/approvals/src/options.ts` — `ApprovalsPluginOptions`, `GroupResolver` type
- `packages/approvals/src/tools/request-approval.ts` — what gets called from the publish pipeline
- `packages/approvals/src/email/decision-tokens.ts` — how the email action URLs are signed
- `packages/workflows/src/expire-stale-approvals.ts` — the daily cron

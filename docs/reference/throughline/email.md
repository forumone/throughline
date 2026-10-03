# Email: `@forumone/throughline/email`

This was `/email` in 0.x; [`docs/spec/1.0-exports.md`](../../spec/1.0-exports.md) maps its imports.

Transactional email for the Throughline framework. Pairs Resend with React Email templates that read brand tokens from the plugin options, and ships three Inngest functions that subscribe to the notification events the audit-event-echo workflow fires.

After this package, the approval workflow is end-to-end: a marketer requests approval via Claude, approvers receive a well-designed email with a one-sentence summary, a preview link, and three clear actions, and decisions / expirations route back to the requester automatically.

## What this package provides

- **`emailPlugin`** — attaches an email client to the Payload instance; `emailJobs` returns the three notification jobs, which `throughline()` puts in `suite.jobs`.
- **`createEmailClient`** — Resend wrapper that lazy-imports both `resend` and `@react-email/render` and produces both HTML and plaintext from the same React tree on every send.
- **Three React Email templates** — `ApprovalRequestEmail`, `ApprovalDecisionEmail` (granted / declined / changes-requested variants), `ApprovalExpiredEmail`. Themed via `EmailBrandTokens`.
- **Three notification jobs** — `notifyApprovalRequestJob`, `notifyApprovalDecisionJob`, `notifyApprovalExpiredJob`, which `emailJobs` hands to any adapter.
- **Brand tokens** — neutral defaults (black on white, system sans, "Your Site"); deployments override via `email: { tokens }`.

## Installation

Part of [`@forumone/throughline`](../throughline.md#installation). It needs `resend`, `@react-email/components`, `@react-email/render` and `react`, loaded on first send, so a missing one fails that send and names the package rather than failing the boot.

`throughline({ email: { … } })` registers it with approvals' collection slug, and signs its action links with approvals' secret unless you pass `buildActionUrl`. The three notification jobs are in `suite.jobs`.

## Usage

```ts
export const suite = throughline({
  jobs: inngestJobs(inngest),
  collections: ['pages'],
  approvals: { groups, groupResolver },
  email: {
    tokens: { brandName: 'Acme Foundation', brandPrimary: '#5B21B6' },
    resolveApprover: async (userId) => {
      const user = await payload.findByID({ collection: 'users', id: userId })
      return user ? { email: user.email, name: user.name } : null
    },
    resolveRequester: async (userId) => {
      const user = await payload.findByID({ collection: 'users', id: userId })
      return user ? { email: user.email, name: user.name } : null
    },
    // Optional preview URL builder for cases where the approval record
    // doesn't carry a previewUrl directly.
    buildPreviewUrl: async ({ approvalId }) =>
      `${process.env.NEXT_PUBLIC_SERVER_URL}/preview?approval=${approvalId}`,
  },
})
```

The three notification jobs are in `suite.jobs`, which the site's Inngest endpoint serves, or `payloadJobs()` registers. `buildActionUrl` defaults to a link signed with approvals' secret against `NEXT_PUBLIC_SERVER_URL`; pass your own only if it does something else.

## How the events flow

1. Approvals server fires `approval.requested` / `approval.granted` / `approval.declined` / `approval.changes_requested` audit events.
2. The `audit-event-echo` job re-fires these as `notification/send-approval-request` and `notification/send-approval-decision`.
3. This package's notification functions handle those events and email the right people.

The `approval/expired` event (fired by the `expire-stale-approvals` cron) is handled directly — no audit-echo translation is needed.

## Brand tokens

Tokens are merged onto neutral defaults; pass only what you want to override:

```ts
throughline({
  // …
  email: {
  tokens: {
    brandName: 'Acme Foundation', // header + From name + footer
    brandPrimary: '#5B21B6', // approve button + discuss link
    fontFamilySans: '"Roobert", system-ui, sans-serif',
  },
  // ...
})
```

`brandName` lands in three places (layout header, From display name, footer disclaimer) so "this came from Acme Foundation" stays consistent.

## Why per-recipient `step.run`

The approval-request notifier sends to every approver in `notifiedApprovers`. Each recipient is wrapped in its own `step.run`, so a bouncing inbox retries without re-sending to the others. Inngest's idempotency keys are per-step, not per-function — batching all sends in one step would mean every retry re-emails everyone.

## Plaintext is non-optional

Every email renders to both HTML and plaintext from the same React tree (React Email's `render(..., { plainText: true })`). Plaintext is required for accessibility (screen readers), deliverability (spam scores improve dramatically), and for clients that refuse HTML.

## Environment

`emailEnv` declares what the plugin reads from the environment and refuses to start without — `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`, used when `apiKey` / `fromAddress` are omitted. Pass it to `assertEnvironment` from `@forumone/throughline` at the top of `payload.config.ts` so both are reported together with every other missing variable. The plugin's own init check reads the same declaration.

## Options reference

| Option                    | Default                                                    | Notes                                                           |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `inngest`                 | supplied by `throughline()`                                | By hand: needed only to register the three functions on Inngest |
| `apiKey`                  | `RESEND_API_KEY` env                                       | Throws at init if neither is set                                |
| `fromAddress`             | `EMAIL_FROM_ADDRESS` env                                   | Required                                                        |
| `fromName`                | `EMAIL_FROM_NAME` env → `tokens.brandName` → `'Your Site'` |                                                                 |
| `replyTo`                 | `EMAIL_REPLY_TO` env                                       | Optional                                                        |
| `tokens`                  | `defaultTokens` (merged onto)                              | Partial override                                                |
| `approvalsCollectionSlug` | approvals' slug, under `throughline()`                     | By hand: match what your approvals plugin uses                  |
| `resolveApprover`         | required                                                   | `(userId) => {email, name}`                                     |
| `resolveRequester`        | required                                                   | `(userId) => {email, name}`                                     |
| `buildActionUrl`          | a signed link, under `throughline()`                       | By hand: required; wrap your approvals plugin's HMAC token      |
| `buildPreviewUrl`         | optional                                                   | Used only when the approval record has no `previewUrl`          |

## Related

- [Approvals](approvals.md): owns the collection this reads
- [Jobs](jobs.md): `audit-event-echo` is the upstream fan-out; `expire-stale-approvals` fires the expiration event this subscribes to
- Guide: [Theming emails](../../guides/theming-emails.md)

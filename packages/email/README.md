# @forumone/throughline-email

Transactional email for the Throughline framework. Pairs Resend with React Email templates that read brand tokens from the plugin options, and ships three Inngest functions that subscribe to the notification events the audit-event-echo workflow fires.

After this package, the approval workflow is end-to-end: a marketer requests approval via Claude, approvers receive a well-designed email with a one-sentence summary, a preview link, and three clear actions, and decisions / expirations route back to the requester automatically.

## What this package provides

- **`emailPlugin`** — registers an email client and the three notification Inngest functions on the Payload instance via Symbols.
- **`createEmailClient`** — Resend wrapper that lazy-imports both `resend` and `@react-email/render` and produces both HTML and plaintext from the same React tree on every send.
- **Three React Email templates** — `ApprovalRequestEmail`, `ApprovalDecisionEmail` (granted / declined / changes-requested variants), `ApprovalExpiredEmail`. Themed via `EmailBrandTokens`.
- **Three notification functions** — `createNotifyApprovalRequestFunction`, `createNotifyApprovalDecisionFunction`, `createNotifyApprovalExpiredFunction`.
- **Brand tokens** — neutral defaults (black on white, system sans, "Your Site"); deployments override via `emailPlugin({ tokens })`.

## Installation

```bash
pnpm add @forumone/throughline-email
```

Peers: `payload@^3.0.0`, `inngest@^4.0.0`, `react@^18 || ^19`. The plugin lazy-loads `resend` and `@react-email/render` on first send, so a misconfigured deploy fails on first email rather than at boot.

## Usage

In your Payload config:

```ts
import { buildConfig } from 'payload'
import { auditPlugin, createInngestClient } from '@forumone/throughline-core'
import { emailPlugin } from '@forumone/throughline-email'

const inngest = createInngestClient({ id: 'my-site' })

export default buildConfig({
  // collections, db, secret...
  plugins: [
    auditPlugin({ inngest }),
    emailPlugin({
      inngest,
      tokens: { brandName: 'Acme Foundation', brandPrimary: '#5B21B6' },
      resolveApprover: async (userId) => {
        const user = await payload.findByID({ collection: 'users', id: userId })
        return user ? { email: user.email, name: user.name } : null
      },
      resolveRequester: async (userId) => {
        const user = await payload.findByID({ collection: 'users', id: userId })
        return user ? { email: user.email, name: user.name } : null
      },
      buildActionUrl: async ({ approvalId, action, approverId }) => {
        // Wrap your approvals plugin's HMAC token. The action endpoint
        // confirms-on-first-hit, so any well-formed URL works here.
        return `${process.env.NEXT_PUBLIC_SERVER_URL}/api/approvals/action?token=...`
      },
      // Optional preview URL builder for cases where the approval record
      // doesn't carry a previewUrl directly.
      buildPreviewUrl: async ({ approvalId }) =>
        `${process.env.NEXT_PUBLIC_SERVER_URL}/preview?approval=${approvalId}`,
    }),
  ],
})
```

Then in your client app's Inngest endpoint:

```ts
// src/app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { inngest } from '@/lib/inngest'
import { getEmailFunctions } from '@forumone/throughline-email'

const payload = await getPayload({ config })
const emailFunctions = getEmailFunctions(payload)

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...emailFunctions /* plus your other functions */],
})
```

The plugin registers functions into the Payload instance via Symbol; the endpoint reads them via `getEmailFunctions`. Same shape used by `@forumone/throughline-integrations`.

## How the events flow

1. Approvals server fires `approval.requested` / `approval.granted` / `approval.declined` / `approval.changes_requested` audit events.
2. C10's `audit-event-echo` re-fires these as `notification/send-approval-request` and `notification/send-approval-decision`.
3. This package's notification functions handle those events and email the right people.

The `approval/expired` event (fired by C10's `expire-stale-approvals` cron) is handled directly — no audit-echo translation is needed.

## Brand tokens

Tokens are merged onto neutral defaults; pass only what you want to override:

```ts
emailPlugin({
  tokens: {
    brandName: 'Acme Foundation',     // header + From name + footer
    brandPrimary: '#5B21B6',           // approve button + discuss link
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

## Options reference

| Option | Default | Notes |
|---|---|---|
| `inngest` | required | Fires no events itself; needed to register the three functions |
| `apiKey` | `RESEND_API_KEY` env | Throws at init if neither is set |
| `fromAddress` | `EMAIL_FROM_ADDRESS` env | Required |
| `fromName` | `EMAIL_FROM_NAME` env → `tokens.brandName` → `'Your Site'` | |
| `replyTo` | `EMAIL_REPLY_TO` env | Optional |
| `tokens` | `defaultTokens` (merged onto) | Partial override |
| `approvalsCollectionSlug` | `'approvals'` | Match what your approvals plugin uses |
| `resolveApprover` | required | `(userId) => {email, name}` |
| `resolveRequester` | required | `(userId) => {email, name}` |
| `buildActionUrl` | required | Per-action URL builder; wrap your approvals plugin's HMAC token |
| `buildPreviewUrl` | optional | Used only when the approval record has no `previewUrl` |

## Related packages

- `@forumone/throughline-core` — required peer; provides logger and audit infrastructure
- `@forumone/throughline-approvals` — owns the approvals collection this package reads
- `@forumone/throughline-workflows` — `audit-event-echo` is the upstream fan-out; `expire-stale-approvals` fires the expiration event this package subscribes to

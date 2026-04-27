# @forumone/throughline-email

Transactional email for the framework. A Resend wrapper, themeable React Email templates, and Inngest functions that subscribe to approval-workflow events. Other plugins (`approvals`, `forms`) consume this one to send mail.

## Install

```bash
pnpm add @forumone/throughline-email
```

Peer dependencies: `payload@^3.0.0`, `inngest@^4.0.0`. Depends on `@forumone/throughline-core`.

## Public API

```typescript
import {
  emailPlugin,
  getEmailClient,
  getEmailFunctions,
  createEmailClient,
  defaultTokens,
  mergeTokens,
  validateOptions,
  createNotifyApprovalRequestFunction,
  createNotifyApprovalDecisionFunction,
  createNotifyApprovalExpiredFunction,
  EmailLayout,
  ApprovalRequestEmail,
  ApprovalDecisionEmail,
  ApprovalExpiredEmail,
  DEFAULT_APPROVALS_COLLECTION_SLUG,
} from '@forumone/throughline-email'

import type {
  EmailPluginOptions,
  EmailClient,
  EmailClientOptions,
  EmailBrandTokens,
  ResolvedEmailEnv,
  ResolvedRecipient,
  ApprovalActionKind,
  BuildActionUrlArgs,
  SendEmailParams,
  SendEmailResult,
  TemplateRenderer,
  EmailLayoutProps,
  ApprovalRequestEmailProps,
  ApprovalDecisionEmailProps,
  ApprovalDecisionKind,
  ApprovalExpiredEmailProps,
  ApprovalTargetKind,
} from '@forumone/throughline-email'
```

## `emailPlugin(options)`

```typescript
emailPlugin({
  inngest,                                   // required
  resolveApprover: (userId: string) => Promise<ResolvedRecipient | null>,    // required
  resolveRequester: (userId: string) => Promise<ResolvedRecipient | null>,   // required
  buildActionUrl: (args: BuildActionUrlArgs) => string,                      // required
  tokens?: Partial<EmailBrandTokens>,
  client?: EmailClient,                      // default: lazy-imports Resend
  templates?: {                              // override individual templates
    ApprovalRequest?: React.FC<ApprovalRequestEmailProps>
    ApprovalDecision?: React.FC<ApprovalDecisionEmailProps>
    ApprovalExpired?: React.FC<ApprovalExpiredEmailProps>
  },
  fromAddress?: string,                      // default: process.env.EMAIL_FROM_ADDRESS
  fromName?: string,                         // default: process.env.EMAIL_FROM_NAME
  replyTo?: string,                          // default: process.env.EMAIL_REPLY_TO
  resendApiKey?: string,                     // default: process.env.RESEND_API_KEY
})
```

The plugin:

- Validates env vars at boot (fails loudly on missing `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`)
- Constructs an `EmailClient` and exposes it via `getEmailClient(payload)` (Symbol-keyed)
- Constructs three Inngest functions and exposes them via `getEmailFunctions(payload)` for the Inngest endpoint to register

## `EmailClient`

```typescript
interface EmailClient {
  send(params: SendEmailParams): Promise<SendEmailResult>
}

interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  text: string
  // optional: from, replyTo override the plugin defaults
}
```

`createEmailClient(options)` creates one. It lazy-imports `resend` only when `send` is called — Resend isn't required at import time, so the package builds cleanly on edge runtimes.

The client renders both HTML and plaintext from React Email. Resend gets both; clients that prefer plaintext fall back automatically.

## Brand tokens

```typescript
interface EmailBrandTokens {
  brandName: string
  brandUrl?: string
  logoUrl?: string
  colors?: { background?, surface?, text?, muted?, primary?, danger?, warning? }
  font?: { family? }
  footer?: { address?, unsubscribeUrl? }
}

defaultTokens                                 // neutral defaults
mergeTokens(defaultTokens, partial)           // shallow-merges
```

See [Theming emails](../guides/theming-emails.md) for the full tokens reference and visual overrides.

## Templates

Three React Email components for the approval workflow:

```typescript
<ApprovalRequestEmail
  approverName="Ada"
  requesterName="Brian"
  targetTitle="About us"
  targetKind="page"
  receivedAt="Apr 22, 2026"
  comment="Please review the new mission statement."
  actions={{
    grantedUrl: '...',
    declinedUrl: '...',
    changesRequestedUrl: '...',
  }}
  brandTokens={tokens}
/>

<ApprovalDecisionEmail
  recipientName="Brian"
  decision="granted" // | 'declined' | 'changes-requested'
  targetTitle="About us"
  decidedByName="Ada"
  decidedAt="Apr 22, 2026 11:42 AM"
  comment="Looks good."
  brandTokens={tokens}
/>

<ApprovalExpiredEmail
  recipientName="Brian"
  targetTitle="About us"
  expiredAt="May 6, 2026"
  brandTokens={tokens}
/>
```

Each renders both HTML (Outlook-safe table layout) and plaintext (via React Email's `render(..., { plainText: true })`).

`EmailLayout` is the shared chrome (header logo, divider, footer address). Use it when authoring custom templates so they look consistent with the bundled ones.

## Inngest functions

Three functions, exposed via `getEmailFunctions(payload)`:

- **`notify-approval-request`**: subscribes to `approval/requested`. Fans out one `step.run` per approver (so failing one doesn't poison the others). Each `step.run` resolves the approver, generates action tokens, renders + sends.
- **`notify-approval-decision`**: subscribes to `approval/granted | approval/declined | approval/changes_requested`. Notifies the requester of the decision.
- **`notify-approval-expired`**: subscribes to `approval/expired`. Notifies the requester that the approval lapsed.

Per-approver `step.run` isolation means one delivery failure doesn't fail the rest.

## Symbol accessors

```typescript
import { getEmailClient, getEmailFunctions } from '@forumone/throughline-email'

const client = getEmailClient(payload)            // EmailClient | undefined
const fns = getEmailFunctions(payload) ?? []      // InngestFunction[]
```

`getEmailClient` is what the Forms plugin (and any custom workflow that wants to send mail) calls. The lookup is lazy; plugin-load order doesn't matter for this consumer-facing API.

## Capabilities required

- `audit-log` — checks for the audit plugin

## Capabilities registered

- `email` — the plugin is loaded
- `email-client` — `getEmailClient` returns a usable client

## Common usage

```typescript
import { emailPlugin } from '@forumone/throughline-email'

emailPlugin({
  inngest,
  resolveApprover: async (userId) => {
    const user = await payload.findByID({ collection: 'users', id: userId })
    return user ? { id: String(user.id), email: user.email, name: user.name } : null
  },
  resolveRequester: async (userId) => {
    const user = await payload.findByID({ collection: 'users', id: userId })
    return user ? { id: String(user.id), email: user.email, name: user.name } : null
  },
  buildActionUrl: ({ token, action }) =>
    `${process.env.NEXT_PUBLIC_SERVER_URL}/api/approvals/decision?token=${token}&action=${action}`,
  tokens: {
    brandName: 'Acme Climate',
    colors: { primary: '#0a4d8a' },
  },
}),
```

## Related

- Guide: [Theming emails](../guides/theming-emails.md)
- Reference: [@forumone/throughline-approvals](approvals.md), [@forumone/throughline-forms](forms.md)

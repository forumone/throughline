# Theming emails

Throughline's transactional emails (approval requests, decisions, expiry, form submissions, submitter confirmations) ship with neutral defaults. They render via React Email and accept a small set of brand tokens that flow into HTML and plaintext output. This guide covers how to brand them and how to swap a template wholesale when the defaults aren't enough.

## What's themable

The Email plugin (`@forumone/throughline-email`) exposes:

```typescript
import type { EmailBrandTokens } from '@forumone/throughline-email'

interface EmailBrandTokens {
  brandName: string
  brandUrl?: string
  logoUrl?: string
  colors?: {
    background?: string      // outer container background
    surface?: string         // card background
    text?: string            // body text
    muted?: string           // de-emphasized text (footer, dividers)
    primary?: string         // primary action color (approve button)
    danger?: string          // decline button
    warning?: string         // request-changes button
  }
  font?: {
    family?: string          // CSS font-family stack
  }
  footer?: {
    address?: string         // physical mailing address (CAN-SPAM)
    unsubscribeUrl?: string  // optional, but include for non-transactional
  }
}
```

Defaults are neutral: white background, near-black text, blue primary, red danger, amber warning. Most clients only override `brandName`, `colors.primary`, and `logoUrl`.

## Set tokens at plugin time

```typescript
import { emailPlugin } from '@forumone/throughline-email'

emailPlugin({
  inngest,
  resolveApprover: async (userId) => { /* ... */ },
  resolveRequester: async (userId) => { /* ... */ },
  buildActionUrl: ({ token, action }) =>
    `${process.env.NEXT_PUBLIC_SERVER_URL}/api/approvals/decision?token=${token}&action=${action}`,
  tokens: {
    brandName: 'Acme Climate',
    brandUrl: 'https://acmeclimate.org',
    logoUrl: 'https://acmeclimate.org/static/logo-email.png',
    colors: {
      primary: '#0a4d8a',
      danger: '#a4252b',
      warning: '#b27619',
    },
    font: {
      family: '"Söhne", system-ui, -apple-system, sans-serif',
    },
    footer: {
      address: '123 Main St, Suite 400, Portland OR 97204',
    },
  },
}),
```

## Test in real clients

React Email previews in browser don't catch every cross-client issue. Send the actual templates to a test inbox set covering:

- Apple Mail (macOS + iOS)
- Outlook (Windows + Outlook web)
- Gmail (web + iOS app)

The framework's templates use HTML tables and inlined styles for Outlook compatibility. If you replace a template, follow the same constraints — see [Replacing a template](#replacing-a-template).

A practical way to test: trigger an approval on a test page and use a service like [Mailtrap](https://mailtrap.io) as your `RESEND_API_KEY` target. Mailtrap captures the rendered HTML and shows you per-client previews.

## Set up the sending domain

Resend requires DNS records (SPF, DKIM, DMARC) before allowing sends from your domain. Walk through:

1. Resend dashboard → Domains → Add domain
2. Copy the SPF / DKIM / DMARC records into your DNS provider
3. Wait 10–30 minutes for verification
4. Set `EMAIL_FROM_ADDRESS` to `<anything>@<verified-domain>`

If you skip DNS configuration, Resend rejects the send and the Email worker logs a delivery failure to the audit log. You'll see the error in the Inngest dashboard before any user does.

## What `EMAIL_FROM_NAME` does

```
From: "Acme Climate" <notifications@acmeclimate.org>
```

`EMAIL_FROM_NAME` becomes the display name. Use the org's name, not "Throughline" or "Payload" — those mean nothing to recipients.

## Replacing a template

If brand tokens aren't enough, swap a template wholesale. The Email plugin accepts a `templates` option:

```typescript
import { emailPlugin } from '@forumone/throughline-email'
import { AcmeApprovalRequestEmail } from './email-templates/AcmeApprovalRequest'

emailPlugin({
  // ...
  templates: {
    ApprovalRequest: AcmeApprovalRequestEmail,
    // The other four (ApprovalDecision, ApprovalExpired, FormSubmission,
    // SubmitterConfirmation) keep their defaults.
  },
})
```

Your replacement must:

- Accept the same props as the default (`{ approverName, requesterName, targetTitle, targetUrl, actions: { grantedUrl, declinedUrl, changesRequestedUrl } }`)
- Render via React Email's `<Html>`, `<Body>`, `<Container>` components for cross-client compatibility
- Produce a usable plaintext fallback (React Email's `render(..., { plainText: true })` handles this; just write the JSX cleanly)

Copy `packages/email/src/templates/ApprovalRequest.tsx` as a starting point. The structure (header / preheader / body / action row / footer) is what most replacements should keep.

## Brand-aware plaintext

The plaintext version is generated automatically from your JSX. Keep an eye on it for:

- Action URLs visible (Claude Mail and CLI clients)
- Brand name in the header line
- Address in the footer (CAN-SPAM)

`render(template, { plainText: true })` is what the Email plugin runs. If your visual structure relies on table layout for spacing, the plaintext won't have spacing — design with that in mind.

## Where to look in code

- `packages/email/src/options.ts` — the full `EmailPluginOptions` shape
- `packages/email/src/templates/_layout.tsx` — shared chrome (header, dividers, footer)
- `packages/email/src/templates/ApprovalRequest.tsx` — three-action approval email; the trickiest layout
- `packages/email/src/client.ts` — how Resend is invoked, where the brand tokens flow in

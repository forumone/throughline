# Theming emails

Throughline's transactional emails (approval requests, decisions and expiry) ship with neutral defaults. They render via React Email and accept a small set of brand tokens that flow into HTML and plaintext output. This guide covers how to brand them, and what to do when the defaults aren't enough.

## What's themable

The email plugin (`@forumone/throughline/email`) takes:

```typescript
import type { EmailBrandTokens } from '@forumone/throughline/email'

interface EmailBrandTokens {
  brandName: string          // header, footer, and the From name when EMAIL_FROM_NAME is unset
  brandPrimary: string       // affirmative buttons (Approve, Preview)
  brandPrimaryHover: string  // reserved; not used by the layout itself
  brandAccent?: string       // secondary highlights
  textPrimary: string        // body text
  textSecondary: string      // labels, footer, helper copy
  bgPrimary: string          // the email card
  bgSecondary: string        // callout sections
  border: string             // hairlines and box outlines
  fontFamilySans: string     // the body's font stack
  logoUrl?: string           // reserved; not yet shown
}
```

Defaults are neutral: white card, near-black text, a blue primary, a system sans stack, and "Your Site" as the name. Pass only what you change; the rest are merged from the defaults. Most sites set `brandName`, `brandPrimary` and `fontFamilySans`.

## Set tokens

```typescript
export const suite = throughline({
  // …
  email: {
    resolveApprover: async (userId) => { /* ... */ },
    resolveRequester: async (userId) => { /* ... */ },
    tokens: {
      brandName: 'Acme Climate',
      brandPrimary: '#0a4d8a',
      fontFamilySans: '"Söhne", system-ui, -apple-system, sans-serif',
    },
  },
})
```

The approve, decline and request-changes links are signed with approvals' secret by default, so there is no `buildActionUrl` to write unless yours does something else.

There is no token for a mailing address. These are transactional emails to a site's own editors and approvers, not marketing mail.

## Test in real clients

React Email previews in browser don't catch every cross-client issue. Send the actual templates to a test inbox set covering:

- Apple Mail (macOS + iOS)
- Outlook (Windows + Outlook web)
- Gmail (web + iOS app)

The framework's templates use HTML tables and inlined styles for Outlook compatibility. If you send emails of your own, follow the same constraints — see [When tokens aren't enough](#when-tokens-arent-enough).

A practical way to test: trigger an approval on a test page and use a service like [Mailtrap](https://mailtrap.io) as your `RESEND_API_KEY` target. Mailtrap captures the rendered HTML and shows you per-client previews.

## Set up the sending domain

Resend requires DNS records (SPF, DKIM, DMARC) before allowing sends from your domain. Walk through:

1. Resend dashboard → Domains → Add domain
2. Copy the SPF / DKIM / DMARC records into your DNS provider
3. Wait 10–30 minutes for verification
4. Set `EMAIL_FROM_ADDRESS` to `<anything>@<verified-domain>`

If you skip DNS configuration, Resend rejects the send and the email job fails, retries, and lands in `job-failures`. You'll see the error there, or in the Inngest dashboard, before any user does.

## What `EMAIL_FROM_NAME` does

```
From: "Acme Climate" <notifications@acmeclimate.org>
```

`EMAIL_FROM_NAME` becomes the display name. Use the org's name, not "Throughline" or "Payload" — those mean nothing to recipients.

## When tokens aren't enough

There is no option to swap one template for another: the three emails are rendered from `ApprovalRequestEmail`, `ApprovalDecisionEmail` and `ApprovalExpiredEmail`, and a site changes them through the tokens.

A site that needs different emails turns `email` off and sends its own. The audit echo job still runs while approvals is on, and fans each approval out as a `notification/send-approval-request`, `-decision` or `-expired` event; a job of the site's own, subscribed to those, renders whatever it likes. The three templates and `EmailLayout` are exported from `@forumone/throughline/email`, with their props types, to compose rather than start from nothing.

A replacement should:

- Render via React Email's `<Html>`, `<Body>`, `<Container>` components for cross-client compatibility
- Produce a usable plaintext fallback (React Email's `render(..., { plainText: true })` handles this; just write the JSX cleanly)

`packages/throughline/src/email/templates/ApprovalRequest.tsx` is the one to copy. Its structure (header / preheader / body / action row / footer) is what most replacements should keep.

## Brand-aware plaintext

The plaintext version is generated automatically from your JSX. Keep an eye on it for:

- Action URLs visible (Claude Mail and CLI clients)
- Brand name in the header line

`render(template, { plainText: true })` is what the Email plugin runs. If your visual structure relies on table layout for spacing, the plaintext won't have spacing — design with that in mind.

## Where to look in code

- `packages/throughline/src/email/options.ts` — the full `EmailPluginOptions` shape
- `packages/throughline/src/email/templates/_layout.tsx` — shared chrome (header, dividers, footer)
- `packages/throughline/src/email/templates/ApprovalRequest.tsx` — three-action approval email; the trickiest layout
- `packages/throughline/src/email/client.ts` — how Resend is invoked, where the brand tokens flow in
- [Email reference](../reference/throughline/email.md)

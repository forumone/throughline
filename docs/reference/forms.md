# @forumone/throughline-forms

Policy-aware forms layer. Wraps Payload's Form Builder plugin with privacy notices, consent, honeypot spam protection, IP rate limiting, an allowlist for destinations, and submitter confirmation. Six MCP tools for Claude-driven form management; submissions fan out to email and webhook destinations via Inngest.

## Install

```bash
pnpm add @forumone/throughline-forms @payloadcms/plugin-form-builder
```

Peer dependencies: `payload@^3.0.0`, `inngest@^4.0.0`. Depends on `@forumone/throughline-core` and `@forumone/throughline-email`.

> [!IMPORTANT]
> `@payloadcms/plugin-form-builder@3.83.0` pins exactly to `payload@3.83.0` (no caret compat). Match the version in your project's lockfile to your Payload version.

## Public API

```typescript
import {
  formsPlugin,
  getFormsFunctions,
  validateOptions,
  listDestinations,
  validateDestinationLabel,
  addFormPolicyFields,
  createCreateFormTool,
  createUpdateFormFieldsTool,
  createUpdateFormDestinationsTool,
  createGetFormSubmissionsTool,
  createValidateFormTool,
  createListAllowedDestinationsTool,
  createFormFanOutFunction,
  createEmailDestinationFunction,
  createWebhookDestinationFunction,
  createSubmitterConfirmationFunction,
  FormsLayout,
  FormSubmissionEmail,
  SubmitterConfirmationEmail,
  DEFAULT_FORMS_SLUG,
  DEFAULT_FORM_SUBMISSIONS_SLUG,
  DEFAULT_PRIVACY_NOTICE,
  DEFAULT_RATE_LIMIT,
  MIN_IP_HASH_SECRET_LENGTH,
} from '@forumone/throughline-forms'

import type {
  FormsPluginOptions,
  AllowedDestination,
  DestinationType,
  ResolvedFormsConfig,
  DestinationLookupResult,
  PolicyFieldsOptions,
  FormsLayoutProps,
  FormSubmissionEmailProps,
  FormSubmissionField,
  SubmitterConfirmationEmailProps,
} from '@forumone/throughline-forms'
```

## `formsPlugin(options)`

```typescript
formsPlugin({
  inngest,                                   // required
  ipHashSecret: string,                      // required; min 32 chars; from process.env.FORMS_IP_HASH_SECRET
  allowedDestinations: AllowedDestination[], // required; min 1, unique labels
  collectionSlug?: string,                   // default 'forms'
  submissionsCollectionSlug?: string,        // default 'form-submissions'
  privacyNotice?: string,                    // default copy
  rateLimit?: { perHour?: number },          // default { perHour: 10 }
  routePrefix?: string,                      // default '/forms'
})

interface AllowedDestination {
  type: 'email' | 'webhook'
  value: string                              // email address or https:// URL
  label: string                              // unique
  description?: string
  // For webhooks:
  signingSecret?: string                     // optional; if set, requests are HMAC-SHA256 signed
}
```

`validateOptions(options)` is what the plugin runs internally. It returns `ResolvedFormsConfig` with:

- All allowlist entries normalized
- Default privacy notice and rate limits filled in
- `ipHashSecret` checked for length

## Submit endpoint

`POST /api/forms/<slug>/submit` is the public submission endpoint. The plugin registers it. The flow:

1. **Honeypot check** — drop on bot input
2. **Form lookup** — verify the form exists and is enabled
3. **Consent check** — require `consent: true` in the body if the form requires it
4. **Rate limit** — Postgres-counted per `(formId, ipHash)` per hour
5. **Persist** — insert into the form-submissions collection with the field values + IP hash
6. **Fire** — `form/submission.received` on Inngest

The IP is HMAC-SHA256-hashed via `ipHashSecret` so logs / database don't store raw IPs.

## MCP tools

| Tool | Required role | Purpose |
| --- | --- | --- |
| `list_allowed_destinations` | `admin`, `editor`, `form-admin` | Returns the allowlist (label + description; not raw values) |
| `validate_form` | `admin`, `editor`, `form-admin` | Dry-run a form definition; reports invalid field types or invalid destinations |
| `create_form` | `admin`, `form-admin` | Create a new form |
| `update_form_fields` | `admin`, `form-admin` | Replace the form's field set |
| `update_form_destinations` | `admin`, `form-admin` | Replace the form's destination list (must be allowlisted) |
| `get_form_submissions` | `admin`, `form-admin` | Read submissions; admin and form-admin only — submissions can contain PII |

`form-admin` is the role for "people who manage forms but not other content." See [Security model](../operations/security-model.md).

## Inngest functions

Four, exposed via `getFormsFunctions(payload)`:

- **`form-fan-out`**: subscribes to `form/submission.received`. Looks up the form's destinations, validates each is on the allowlist (defense-in-depth), and fires per-destination follow-up events.
- **`form-email-destination`**: per-destination email. Renders `FormSubmissionEmail` and sends via the Email plugin's client.
- **`form-webhook-destination`**: per-destination webhook. POSTs JSON; if the destination has a `signingSecret`, signs with HMAC-SHA256 (`X-Throughline-Signature` header).
- **`form-submitter-confirmation`**: optional auto-reply to the submitter. Configured per-form (subject, body, target email field).

The fan-out + per-destination split means one bad destination doesn't poison the rest.

## Defense in depth

The destination allowlist is enforced at three layers:

1. **At the MCP tool**: `update_form_destinations` rejects unknown labels
2. **At the form collection's `beforeChange` hook**: rejects unknown labels at save time (catches admin UI edits)
3. **At the fan-out worker**: rejects unknown labels at delivery time (catches edge cases where the allowlist changed between save and delivery)

This is deliberate. Form destinations are the most attractive abuse surface (open relay risk); the redundant gates are correct.

## Templates

`FormSubmissionEmail` is the admin-facing notification (sent to the destination email). `SubmitterConfirmationEmail` is the optional auto-reply. Both use `FormsLayout` for consistent chrome.

## Capabilities required

- `audit-log` — for writing audit rows on submissions
- `email` — for the email destination function

## Capabilities registered

- `forms` — the plugin is loaded
- `forms-allowlist` — the allowlist is in place

## Common usage

```typescript
import { formsPlugin } from '@forumone/throughline-forms'

formsPlugin({
  inngest,
  ipHashSecret: process.env.FORMS_IP_HASH_SECRET!,
  allowedDestinations: [
    {
      type: 'email',
      value: 'team@acmeclimate.org',
      label: 'Main inbox',
      description: 'General contact form destination',
    },
    {
      type: 'email',
      value: 'press@acmeclimate.org',
      label: 'Press',
    },
    {
      type: 'webhook',
      value: 'https://api.zapier.com/hooks/...',
      label: 'Zapier (CRM sync)',
      signingSecret: process.env.ZAPIER_FORMS_SIGNING_SECRET,
    },
  ],
}),
```

## Related

- Reference: [@forumone/throughline-email](email.md) — destination delivery
- Reference: [@forumone/throughline-core](core.md) — audit log
- Operations: [Security model](../operations/security-model.md) — form-related controls

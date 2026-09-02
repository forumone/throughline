# Environment variables

Every variable a Throughline project reads, grouped by feature, with how to generate or obtain each.

The CLI scaffolder writes a complete `.env.example` for new projects. This page is the reference for what each variable does and what happens if it's missing or wrong.

## Required core

```
DATABASE_URI                    # Postgres connection string
PAYLOAD_SECRET                  # 48+ random bytes; signs Payload sessions
NEXT_PUBLIC_SERVER_URL          # https://your-domain.com (or http://localhost:3000)
```

| Variable | Generate / obtain | Missing? |
| --- | --- | --- |
| `DATABASE_URI` | From Neon / Supabase / your DB provider | Payload fails to boot |
| `PAYLOAD_SECRET` | `openssl rand -base64 48` | Payload fails to boot; sessions can't be signed |
| `NEXT_PUBLIC_SERVER_URL` | Your deployed domain | Webhooks, email links, Inngest serve URL all break |

`NEXT_PUBLIC_SERVER_URL` ends up in:

- The `Origin` and `Host` checks Payload runs
- Approval email action URLs (the `?token=...&action=...` link)
- Webhook destinations' default URL roots
- `revalidateOnPublish`'s path computation

In local dev, `http://localhost:3000`. In production, your full HTTPS URL.

## Inngest

```
INNGEST_EVENT_KEY               # production: from Inngest app's Keys page
INNGEST_SIGNING_KEY             # production: from Inngest app's Keys page
```

In local dev with `npx inngest-cli dev`, leave both blank. The dev server discovers your endpoint without keys.

In production, set both. Without them, Inngest events can't be received and workflows don't run. The Publishing pipeline still works (it doesn't depend on workflows) but downstream subscribers (email, integrations) silently don't fire.

## Email (Resend)

```
RESEND_API_KEY                  # from Resend dashboard
EMAIL_FROM_ADDRESS              # must be on a Resend-verified domain
EMAIL_FROM_NAME                 # display name; e.g. "Acme Climate"
EMAIL_REPLY_TO                  # optional; defaults to FROM_ADDRESS
```

Without `RESEND_API_KEY`, the Email plugin's workers throw on first send and the audit log records `email.send-failed`. Approval workflows still queue requests, but no email reaches approvers.

## Approval tokens

```
APPROVAL_TOKEN_SECRET           # 48+ random bytes; HMACs the email action tokens
```

Generate: `openssl rand -base64 48`.

This signs the URLs in approval emails. If it changes after emails are sent, those URLs become invalid. Rotate carefully — ideally only when a key is suspected of leaking.

Missing? The Approvals plugin fails to boot.

## Forms

```
FORMS_IP_HASH_SECRET            # 32+ chars; HMAC-SHA256 keyed
```

Generate: `openssl rand -base64 48`.

The Forms plugin hashes submitter IPs (rather than storing them raw) for spam-rate-limiting. The HMAC means a hash is reversible only with this key. Treat it as a secret.

Missing or shorter than 32 chars? The Forms plugin fails to boot.

## MCP keys are not environment variables

There are none of these any more. The six `*_SERVER_API_KEY` variables went with the
six per-server endpoints they authenticated against; if they are still in a
`.env.local` or a Vercel project, they are read by nothing and can be deleted.

An MCP key now lives in two places and neither is an env var: a row in
`payload-mcp-api-keys`, created in the Payload admin under **MCP**, and the
`Authorization: Bearer <key>` header in the client's own config. One key reaches
every tool on `/api/mcp`.

The one adjacent variable that remains is `PUBLISHING_SYSTEM_API_KEY`, and it is not
an MCP key — Inngest calls the publish pipeline directly for scheduled publishes.
See below.

## System keys

```
PUBLISHING_SYSTEM_API_KEY
```

A separate API key for the scheduled-publish workflow. The `createExecuteScheduledPublishesFunction` cron calls Publishing MCP with this key, on behalf of "the system" (no human user). Treat it like the others: create in the API Keys collection with `name: 'system'`, paste here.

If unset, scheduled publishes can't execute and the cron logs `unauthorized` errors.

## Optional storage

```
BLOB_READ_WRITE_TOKEN           # Vercel Blob storage; provided by Vercel integration
```

The scaffold's `payload.config.ts` includes a Vercel Blob storage adapter. Drop or replace if you're using S3, R2, or self-hosted storage. See Payload's storage adapter docs.

## Optional embeddings

```
VOYAGE_API_KEY                  # for the Components plugin's embedding-based intent matching
```

The Components plugin's `propose_components` tool ranks candidates by intent match. Default strategy is TF-IDF (no API key needed); for higher-quality matching, opt into embeddings:

```typescript
componentsPlugin({
  manifest: { /* ... */ },
  matching: { strategy: 'voyage', model: 'voyage-3-lite' },
})
```

With `strategy: 'voyage'`, you must supply `VOYAGE_API_KEY`.

## Local-dev convenience

```
NEXT_PUBLIC_PAYLOAD_PRELOAD=true   # warms up Payload on first request
NODE_OPTIONS=--max-old-space-size=4096   # avoids OOM on large block schemas
```

Neither is required. Use them when local dev feels sluggish or fails on memory.

## Where files live

| File | Purpose | Committed to git? |
| --- | --- | --- |
| `.env.example` | Template; documents every variable | Yes |
| `.env.local` | Your actual values | No (in `.gitignore`) |
| Vercel project settings | Production values | Set via Vercel UI |

Never commit `.env.local`. The CLI scaffolder includes it in `.gitignore`; if you add another env file, add it to `.gitignore` too.

## Loading order

Next.js loads `.env.local` over `.env.development` over `.env`. Throughline doesn't add anything to that — standard Next.js behavior. The Payload config reads `process.env.X` directly; there's no wrapper that injects defaults. If a value isn't in the environment, it's `undefined` at runtime.

## Validating

The Core package exports `validateEnv(spec)` that you can call at app boot to fail fast on missing vars:

```typescript
// apps/web/src/env.ts
import { validateEnv } from '@forumone/throughline-core/env'

export const env = validateEnv({
  DATABASE_URI: { required: true },
  PAYLOAD_SECRET: { required: true, minLength: 24 },
  NEXT_PUBLIC_SERVER_URL: { required: true, format: 'url' },
  RESEND_API_KEY: { required: true },
  // …
})
```

Then import `env` from this module everywhere. Missing or malformed values throw at boot rather than at first use.

The scaffold doesn't wire this by default — different teams want different strictness levels. Wire it when you've stabilized your env list.

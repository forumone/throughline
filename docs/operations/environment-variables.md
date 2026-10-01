# Environment variables

Every variable a Throughline project reads, grouped by feature, with how to generate or obtain each.

The CLI scaffolder writes a complete `.env.example` for new projects. This page is the reference for what each variable does and what happens if it's missing or wrong.

Every variable a site cannot start without is checked once, at the top of `payload.config.ts`, and reported together — see [Checking everything at startup](#checking-everything-at-startup).

## Required core

```
DATABASE_URI                    # Postgres connection string
PAYLOAD_SECRET                  # 48+ random bytes; signs Payload sessions
NEXT_PUBLIC_SERVER_URL          # https://your-domain.com (or http://localhost:3000)
```

| Variable                 | Generate / obtain                                                                         | Missing?                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URI`           | From Neon / Supabase / your DB provider (or the Vercel–Neon integration's `DATABASE_URL`) | Reported by `assertEnvironment` in the scaffold                                                                       |
| `PAYLOAD_SECRET`         | `openssl rand -base64 48`                                                                 | Reported by `assertEnvironment` in the scaffold, as is one under 32 characters                                        |
| `NEXT_PUBLIC_SERVER_URL` | Your deployed domain                                                                      | Reported by `assertEnvironment` in the scaffold. Unchecked, webhooks, email links and the Inngest serve URL all break |

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

`RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` are declared in `emailEnv`. Without either (and without the matching `apiKey` / `fromAddress` option), the Email plugin refuses to start. A key that is set but wrong is only found on first send, when the worker fails and the audit log records `email.send-failed`.

## Approval tokens

```
APPROVAL_TOKEN_SECRET           # 48+ random bytes; HMACs the email action tokens
```

Generate: `openssl rand -base64 48`.

This signs the URLs in approval emails. If it changes after emails are sent, those URLs become invalid. Rotate carefully — ideally only when a key is suspected of leaking.

Missing or shorter than 32 characters? The Approvals plugin refuses to start. Declared in `approvalsEnv`.

## Forms

```
FORMS_IP_HASH_SECRET            # 32+ chars; HMAC-SHA256 keyed
```

Generate: `openssl rand -base64 48`.

The Forms plugin hashes submitter IPs (rather than storing them raw) for spam-rate-limiting. The HMAC means a hash is reversible only with this key. Treat it as a secret.

Missing or shorter than 32 chars? The Forms plugin refuses to start. Declared in `formsEnv`.

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

## Optional error reporting

```
ERROR_WEBHOOK_URL               # where error reports are POSTed as JSON
```

Read by `reportError` in `@forumone/throughline-core/observability`, which the
scaffold calls from `instrumentation.ts` (unhandled request errors) and from the
workflow failure handlers (jobs out of retries, failing healthchecks). Any URL
that accepts a JSON POST: a log drain, an alerting endpoint, a Slack incoming
webhook, a proxy in front of an error tracker. Each report carries a one-line
`text`, so Slack needs nothing in between.

Unset means reports reach the log and go no further. That is fine on a laptop
and almost certainly a mistake in production, so the scaffold's `register()`
warns at boot when it is unset or not a URL. It is read on every report, not at
import. See [Observability](observability.md#error-reporting).

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
  manifest: {/* ... */},
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

## Payload CLI runner

Read by `throughline-payload`, which the scaffold's `payload`, `generate:*` and
`migrate*` scripts run through. Neither belongs in `.env`; set them on the
command line for one run.

```
PAYLOAD_CLI_TIMEOUT_MS=900000   # wall clock in ms; 0 disables. Default 300000, none for migrate*
PAYLOAD_CLI_GRACE_MS=5000       # wait between SIGTERM and SIGKILL
```

```bash
PAYLOAD_CLI_TIMEOUT_MS=0 pnpm --dir apps/web generate:types
```

See the [core reference](../reference/core.md#throughline-payload-bin).

## Where files live

| File                    | Purpose                            | Committed to git?    |
| ----------------------- | ---------------------------------- | -------------------- |
| `.env.example`          | Template; documents every variable | Yes                  |
| `.env.local`            | Your actual values                 | No (in `.gitignore`) |
| Vercel project settings | Production values                  | Set via Vercel UI    |

Never commit `.env.local`. The CLI scaffolder includes it in `.gitignore`; if you add another env file, add it to `.gitignore` too.

## Loading order

Next.js loads `.env.local` over `.env.development` over `.env`. Throughline doesn't add anything to that — standard Next.js behavior. The Payload config reads `process.env.X` directly; there's no wrapper that injects defaults. If a value isn't in the environment, it's `undefined` at runtime.

## Checking everything at startup

A plugin that reads a variable at init used to be the only thing that checked
it, and it threw on the first problem it found, in registration order. A deploy
missing four variables failed four times, each time as a stack trace inside
`next build`'s "Failed to collect page data" that named a plugin rather than the
variable.

Now each plugin that falls back to `process.env` declares what it cannot start
without, as data, and a site checks all of it at once.

### What the plugins declare

| Export                                                | Variable                | Minimum length | Used when                 |
| ----------------------------------------------------- | ----------------------- | -------------- | ------------------------- |
| `approvalsEnv` from `@forumone/throughline-approvals` | `APPROVAL_TOKEN_SECRET` | 32             | `tokenSecret` is omitted  |
| `emailEnv` from `@forumone/throughline-email`         | `RESEND_API_KEY`        | —              | `apiKey` is omitted       |
| `emailEnv`                                            | `EMAIL_FROM_ADDRESS`    | —              | `fromAddress` is omitted  |
| `formsEnv` from `@forumone/throughline-forms`         | `FORMS_IP_HASH_SECRET`  | 32             | `ipHashSecret` is omitted |

No other plugin refuses to start over a variable: core, publishing, workflows,
integrations, components and audit read nothing they require. Each entry is an
`EnvRequirement` (`{ name, minLength?, why }`, from
`@forumone/throughline-plugin-contract`), and the plugin's own init check is
driven by the same entry, so the declaration and the check cannot drift. Each
plugin's tests assert that — with only the declared variables set it starts,
and without any one of them it refuses. A site that passes the value as an
option instead leaves that plugin's list out.

### `assertEnvironment`

`assertEnvironment` from `@forumone/throughline-core` takes the plugins' lists
and the site's own variables, and throws one `EnvironmentError` listing every
missing or too-short value, each with why it is needed. The scaffold calls it
first in `apps/web/src/payload.config.ts`, at module scope, so it runs before
any plugin can fail on its own narrower check:

```typescript
import { assertEnvironment } from '@forumone/throughline-core'
import { approvalsEnv } from '@forumone/throughline-approvals'
import { emailEnv } from '@forumone/throughline-email'
import { formsEnv } from '@forumone/throughline-forms'
import { databaseConnectionString } from './lib/database'

assertEnvironment(
  approvalsEnv,
  emailEnv,
  formsEnv,
  {
    name: 'PAYLOAD_SECRET',
    minLength: 32,
    why: 'Signs Payload sessions and auth tokens. Generate with `openssl rand -base64 48`.',
  },
  {
    name: 'NEXT_PUBLIC_SERVER_URL',
    why: 'The origin approval links are built against. On a Vercel preview, set it to https://$VERCEL_URL.',
  },
  // Several names are accepted (see lib/database.ts), so this is a check, not a name.
  () => databaseConnectionString(),
)
```

A failure reads:

```
Configuration problem: 3 environment variables are missing or invalid. This is not a code or build failure; nothing will start until they are set.

  - APPROVAL_TOKEN_SECRET is not set. Signs the approve/decline links in approval emails; approvalsPlugin will not start without it. …
  - PAYLOAD_SECRET is 12 characters; the minimum is 32. Signs Payload sessions and auth tokens. …
  - No database connection string. Set DATABASE_URI, or connect a Neon database in Vercel — …

Set each in the environment this process runs in (.env locally, your host's settings when deployed). …
```

The rules:

- Each argument is an `EnvRequirement`, a list of them, or a function. A
  function is for a rule that is not "this name, this long" — the database URL,
  which may arrive under several names, or "a Blob token on Vercel". Whatever it
  throws becomes a line of the report, so it must not include the value either.
- Empty and whitespace-only count as not set.
- Values are never printed. A too-short value is reported by its length.
- A name listed twice (by a plugin and by the site, say) is reported once,
  against the strictest `minLength`.

Add a variable to the site's part of the call when you add one the site cannot
start without, and to `.env.example`, CI's placeholders and `turbo.json`'s
`tasks.build.env` with it.

### When the environment is legitimately absent

Anything that loads `payload.config.ts` runs the check: `next build`,
`payload generate:types`, `payload generate:importmap`, `payload migrate`. That
was already true — the plugins' own checks and the database resolver ran at the
same moment — so the call adds no new place where variables are needed, only
two names (`PAYLOAD_SECRET` and `NEXT_PUBLIC_SERVER_URL`) that used to fail
later or not at all. Where only parsing matters, such as CI's typecheck and
type generation, placeholders of the right length are enough; the scaffold's
`.github/workflows/ci.yml` sets them.

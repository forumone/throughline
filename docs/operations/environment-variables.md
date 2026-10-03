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
| `NEXT_PUBLIC_SERVER_URL` | Your deployed domain                                                                      | Reported by `assertEnvironment` in the scaffold. Unchecked, approval emails cannot be built                           |

`NEXT_PUBLIC_SERVER_URL` ends up in:

- Approval email action URLs (`/api/approvals/action?token=...`), unless `approvals.publicUrl` is set
- The preview link `request_approval` attaches to a request (`/api/preview?collection=...&slug=...`), under the same fallback

Nothing else in the suite reads it. In local dev, `http://localhost:3000`. In production, your full HTTPS URL.

The database string may also arrive under the Vercel–Neon integration's names (`DATABASE_URL`, `POSTGRES_URL` and their unpooled pair); the scaffold's `apps/web/src/lib/database.ts` lists the order it tries them in, and why `DATABASE_URI` leads. `MIGRATION_DATABASE_URL` is optional: a schema-owner credential only `pnpm migrate` uses, so the running app can connect as a role that reads and writes rows and no more.

## Inngest

```
INNGEST_EVENT_KEY               # production: from Inngest app's Keys page
INNGEST_SIGNING_KEY             # production: from Inngest app's Keys page
```

In local dev with `npx inngest-cli dev`, leave both blank. The dev server discovers your endpoint without keys.

In production, set both. Without them, Inngest events can't be sent or received, and on an Inngest site every job in `suite.jobs` is an Inngest function: revalidation on publish, scheduled publishing, approval expiry, the approval emails, integration syncs and the healthcheck all stop. A publish itself still succeeds — the pipeline reports success when only the event fails to send — so the symptom is a published page that never revalidates and an approver who never hears about it.

A site whose jobs run on Payload Jobs (`payloadJobs()` from `@forumone/throughline/jobs/payload`) needs neither variable.

## Email (Resend)

```
RESEND_API_KEY                  # from Resend dashboard
EMAIL_FROM_ADDRESS              # must be on a Resend-verified domain
EMAIL_FROM_NAME                 # optional display name; falls back to the email tokens' brandName
EMAIL_REPLY_TO                  # optional; unset, replies go to the From address
```

`RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` are declared in `emailEnv`. Without either (and without the matching `apiKey` / `fromAddress` option), the Email plugin refuses to start. A key that is set but wrong is only found on first send: the notification job fails, retries, and once out of retries is recorded in `job-failures` and posted to `ERROR_WEBHOOK_URL`. See [Observability](observability.md#job-failures).

## Approval tokens

```
APPROVAL_TOKEN_SECRET           # 48+ random bytes; HMACs the email action tokens
```

Generate: `openssl rand -base64 48`.

This signs the URLs in approval emails. If it changes after emails are sent, those URLs become invalid. Rotate carefully — ideally only when a key is suspected of leaking.

Missing or shorter than 32 characters? The Approvals plugin refuses to start. Declared in `approvalsEnv`.

`FORMS_IP_HASH_SECRET` is not a 1.0 variable: the Forms plugin is not part of Throughline 1.0 and stays on the 0.x line (the `v0` branch).

## MCP keys are not environment variables

There are none of these any more. The six `*_SERVER_API_KEY` variables went with the
six per-server endpoints they authenticated against; if they are still in a
`.env.local` or a Vercel project, they are read by nothing and can be deleted.

An MCP key now lives in two places and neither is an env var: a row in
`payload-mcp-api-keys`, created in the Payload admin under **MCP**, and the
`Authorization: Bearer <key>` header in the client's own config. One key reaches
every tool on `/api/mcp` that its checkboxes allow.

`PUBLISHING_SYSTEM_API_KEY` is gone too, and nothing reads it. Scheduled
publishes run in process: `publishAtScheduledTimeJob` and its daily backstop,
`executeScheduledPublishesJob`, call `publishScheduledThroughPipeline`, which
publishes through the same pipeline an editor's publish does, as
`scheduled-publish`. See [Why scheduled publishes go through the
pipeline](../reference/throughline/jobs.md#why-scheduled-publishes-go-through-the-pipeline).

## Optional error reporting

```
ERROR_WEBHOOK_URL               # where error reports are POSTed as JSON
```

Read by `reportError` in `@forumone/throughline/observability`, which the
scaffold calls from `instrumentation.ts` (unhandled request errors), and which
the failure handlers in `@forumone/throughline/jobs` call: the terminal-failure
handler the scaffold's Inngest route gives every job (jobs out of retries), and
the healthcheck handler `throughline()` gives the healthcheck by default
(failing checks). Any URL
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

For a Vercel Blob storage adapter, if you add one to `payload.config.ts`; drop the variable if you use S3, R2 or self-hosted storage. See Payload's storage adapter docs. `@forumone/throughline/media`'s client-upload hardening also falls back to it when it is passed no token.

## No embeddings variable

`VOYAGE_API_KEY` is read by nothing. The Components plugin's `suggest_for_intent` tool ranks candidates with TF-IDF, which needs no key, and `matching.strategy` accepts `'tfidf'` and nothing else.

## Local-dev convenience

```
NODE_OPTIONS=--max-old-space-size=4096   # avoids OOM on large block schemas
```

Not required. Use it when local dev fails on memory.

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

See [the `throughline-payload` bin](../reference/throughline.md#throughline-payload-bin).

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

| Export                                                | Variable                | Minimum length | Used when                |
| ----------------------------------------------------- | ----------------------- | -------------- | ------------------------ |
| `approvalsEnv` from `@forumone/throughline/approvals` | `APPROVAL_TOKEN_SECRET` | 32             | `tokenSecret` is omitted |
| `emailEnv` from `@forumone/throughline/email`         | `RESEND_API_KEY`        | —              | `apiKey` is omitted      |
| `emailEnv`                                            | `EMAIL_FROM_ADDRESS`    | —              | `fromAddress` is omitted |

No other plugin refuses to start over a variable: publishing, jobs,
integrations, components, audit, editorial and the rest read nothing they
require. Each entry is an `EnvRequirement` (`{ name, minLength?, why }`, from
`@forumone/throughline`), and the plugin's own init check is
driven by the same entry, so the declaration and the check cannot drift. Each
plugin's tests assert that — with only the declared variables set it starts,
and without any one of them it refuses. A site that passes the value as an
option instead leaves that plugin's list out.

### `assertEnvironment`

`assertEnvironment` from `@forumone/throughline` takes the plugins' lists
and the site's own variables, and throws one `EnvironmentError` listing every
missing or too-short value, each with why it is needed. The scaffold calls it
first in `apps/web/src/payload.config.ts`, at module scope, so it runs before
any plugin can fail on its own narrower check:

```typescript
import { assertEnvironment } from '@forumone/throughline'
import { approvalsEnv } from '@forumone/throughline/approvals'
import { emailEnv } from '@forumone/throughline/email'
import { databaseConnectionString } from './lib/database'

assertEnvironment(
  approvalsEnv,
  emailEnv,
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

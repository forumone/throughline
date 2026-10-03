# Deploying to Vercel

End state: your project running on Vercel with Postgres on Neon, Inngest on Inngest Cloud, and email on Resend. Claude can connect to your production MCP endpoint and operate the live site.

Prerequisite: a working local setup (see [Scaffolding a project](scaffolding-a-project.md)), with the first migration, `payload-types.ts` and `importMap.js` committed.

## 1. Push to GitHub

```bash
git remote add origin git@github.com:your-org/your-site.git
git push -u origin main
```

## 2. Provision Postgres (Neon)

Either connect Neon from the Vercel project's **Storage** tab, or create a project at https://neon.tech and copy its connection strings yourself.

The scaffold's `apps/web/src/lib/database.ts` reads, in order, `DATABASE_URI`, then the Vercel–Neon integration's `DATABASE_URL`, `POSTGRES_URL`, `DATABASE_URL_UNPOOLED` and `POSTGRES_URL_NON_POOLING`. So with the integration connected you don't have to set `DATABASE_URI` at all, and the running app gets the **pooled** string, which is what serverless functions should use.

Migrations are the exception: `pnpm migrate` refuses a pooled Neon host. It reads `MIGRATION_DATABASE_URL` first, then `DATABASE_URI`, then the direct strings ahead of the pooled ones. If you set `DATABASE_URI` to a pooled string, set `MIGRATION_DATABASE_URL` to the direct one.

Branch-per-preview: if you give every preview its own Neon branch, scope a `DATABASE_URI` to the Preview environment pointing at it. The integration's variables are project-wide and resolve to production, and `DATABASE_URI` is read first so that a preview never falls through to them.

## 3. Provision Inngest

1. https://app.inngest.com → New app
2. Note the `INNGEST_EVENT_KEY` (production) and `INNGEST_SIGNING_KEY` from the app's Keys page
3. Configure the app's serve URL: `https://your-project.vercel.app/api/inngest`

## 4. Provision Resend

1. https://resend.com → Add a domain (or use the shared sandbox domain for testing)
2. Verify DNS records
3. Create an API key with "send" scope; this becomes `RESEND_API_KEY`

## 5. Create the Vercel project

1. https://vercel.com/new → Import your repo
2. Framework Preset: **Next.js** (auto-detected)
3. Root Directory: `apps/web`
4. Build Command: `cd ../.. && pnpm turbo run build --filter=@your-scope/web` — or `--filter=<project-name>-web` if you left the scope blank. Turbo builds the design system first, because `payload.config.ts` imports its built manifest.

In **Environment Variables**, add:

```
DATABASE_URI                  postgres://...           # unless the Neon integration provides it
MIGRATION_DATABASE_URL        postgres://...           # only if DATABASE_URI is pooled
PAYLOAD_SECRET                <openssl rand -base64 48>
NEXT_PUBLIC_SERVER_URL        https://your-project.vercel.app

INNGEST_EVENT_KEY             <from Inngest>
INNGEST_SIGNING_KEY           <from Inngest>

RESEND_API_KEY                <from Resend>
EMAIL_FROM_ADDRESS            notifications@your-domain.com
EMAIL_FROM_NAME               Your Site

APPROVAL_TOKEN_SECRET         <openssl rand -base64 48>

ERROR_WEBHOOK_URL             <optional: where failures are POSTed>
```

There are no MCP keys in this list. Keys are documents in the database; you make them in the production admin in step 8.

`NEXT_PUBLIC_SERVER_URL` is the origin approval links are built against. On a preview, set it to that deployment's URL.

`next build` loads `payload.config.ts`, whose `assertEnvironment` call reports every missing or too-short variable in one error that starts `Configuration problem`. If the first build fails with that, it is the list of what is left to set, not a code problem.

## 6. Migrate the production database

The scaffold does not migrate on deploy. `next build` runs no migrations and the config sets `push: false`, so a deploy against an empty database serves an admin with no tables behind it. Apply the committed migrations before the first deploy, from your machine, with the production direct connection string on the command line:

```bash
MIGRATION_DATABASE_URL='postgres://…direct…' pnpm --dir apps/web migrate
```

The command prints `payload migrate: connecting via MIGRATION_DATABASE_URL`. Check that it names the variable you meant. If you would rather migrate on every deploy, prefix the Build Command with `pnpm --dir apps/web migrate &&` — and then every preview build migrates whichever database it is pointed at.

Then hit Deploy.

## 7. First admin user

Visit `https://your-project.vercel.app/admin` and create your admin user. The scaffold's `users` collection makes a new user an admin by default; change that default before you invite anyone else.

## 8. Generate a production MCP key

In the production admin, open **MCP** → **API Keys** and create one, exactly as in local development. It is bound to you, and it goes in your MCP client's config, not in Vercel. Each person who will use Claude against the site creates their own.

> [!WARNING]
> An MCP key runs every tool as the user it is bound to. Treat it like a password for that account. Don't commit it, don't share it, and disable it in the admin if it is exposed.

## 9. Connect Claude

Edit your Claude Desktop / Claude Code config to point at the production endpoint — replace `http://localhost:3000` with `https://your-project.vercel.app` in the URL from [First Claude connection](first-claude-connection.md). Use the production key.

## 10. Verify

Ask Claude:

```
List the components available in my design system.
```

You should get the same list as locally. If you get a `401`, the MCP key is wrong or not enabled. The `curl` check in [First Claude connection](first-claude-connection.md#or-check-it-with-curl-first) works against production too.

## What about cold starts?

Vercel's serverless runtime can introduce 1–3 second cold starts on infrequently-hit endpoints. For Claude-driven workflows this is rarely a problem — Claude is patient. But if you find yourself routinely waiting on cold starts, see [Deployment options](../operations/deployment-options.md) for the Railway / Fly path.

## Health checks

The scaffold turns on `healthcheckJob` through `throughline()`'s `healthcheck` key, with one check, `createPayloadReachableCheck()`. It runs every 15 minutes by default and sends a `system/healthcheck` event each run. A failing check is recorded in the admin's **Job Failures** collection and posted to `ERROR_WEBHOOK_URL` if that is set. See [Observability](../operations/observability.md) for how to read those.

## Next

- [Configuring approvers](../guides/configuring-approvers.md) to connect approval groups to your real users
- [Theming emails](../guides/theming-emails.md) to brand the approval email shell
- [Security model](../operations/security-model.md) before you go live

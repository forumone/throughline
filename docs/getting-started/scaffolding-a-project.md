# Scaffolding a project

End state: a Payload admin running locally at `http://localhost:3000/admin` with the Throughline suite registered by one `throughline()` call, and an Inngest endpoint serving every job that call lists.

Time: about 15 minutes.

## 1. Run the scaffolder

```bash
pnpm create @forumone/throughline my-site
cd my-site
```

The CLI asks seven questions:

| Question | Recommended answer |
| --- | --- |
| Project name | matches your directory name |
| npm scope (without `@`) | leave blank for now; you can rename internal workspace packages later |
| Use the Throughline reference design system as a starting point? | yes — gets you a working components setup immediately |
| Where will this deploy? | `vercel` if you don't know yet |
| Postgres provider? | `neon` if you don't know yet |
| Initialize a git repository? | yes |
| Install dependencies now? | yes |

The two platform answers change nothing in the generated project; the Postgres answer only changes a hint in the next steps the CLI prints.

Answering yes to the design system question vendors the reference design system — twelve components with contracts, tokens and Storybook — into `design-system/`. It is source your project owns from then on, not a dependency. See [`@forumone/create-throughline`](../reference/create-throughline.md#the-reference-design-system).

If you skipped install: run `pnpm install` from the project root.

## 2. Provision Postgres

Create a database and grab a connection string. With Neon:

1. Sign up at https://neon.tech
2. Create a project (free tier)
3. Copy the **direct** connection string — the one whose host has no `-pooler` in it

`pnpm migrate` refuses a Neon pooled endpoint: PgBouncer in transaction mode cannot run the DDL a migration needs. The direct string works for the dev server too. If you want the app on the pooler, put the pooled string in `DATABASE_URI` and the direct one in `MIGRATION_DATABASE_URL`, which only `migrate` reads. `apps/web/src/lib/database.ts` explains the order it reads variables in.

For local development with Docker:

```bash
docker run --rm -d --name throughline-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=throughline postgres:16
# DATABASE_URI=postgres://postgres:dev@localhost:5432/throughline
```

## 3. Generate secrets

```bash
openssl rand -base64 48  # PAYLOAD_SECRET
openssl rand -base64 48  # APPROVAL_TOKEN_SECRET
```

## 4. Fill in `.env.local`

```bash
cp .env.example apps/web/.env.local
```

Put it in `apps/web/`. `next dev` reads env files from its own directory, and the Payload CLI that `migrate` and `generate:*` run looks there first.

Open `apps/web/.env.local` and set, at minimum:

- `DATABASE_URI` — your Postgres connection string
- `PAYLOAD_SECRET`, `APPROVAL_TOKEN_SECRET` — generated above; each at least 32 characters
- `RESEND_API_KEY` — from your Resend dashboard
- `EMAIL_FROM_ADDRESS` — must be on a domain verified in Resend
- `NEXT_PUBLIC_SERVER_URL` — `http://localhost:3000` locally; approval links are built against it

There are no MCP keys in this file. Keys are documents in the admin; see step 8.

You don't have to get the list right first time. The first statement of
`apps/web/src/payload.config.ts` calls `assertEnvironment` with the approvals
and email plugins' declared requirements plus the site's own, and anything that
loads the config fails with one error listing every variable still missing or
too short, and why each is needed:

```
Configuration problem: 2 environment variables are missing or invalid. …

  - APPROVAL_TOKEN_SECRET is not set. Signs the approve/decline links in approval emails; …
  - PAYLOAD_SECRET is 12 characters; the minimum is 32. Signs Payload sessions and auth tokens. …
```

Values are never printed. See [Environment variables](../operations/environment-variables.md#checking-everything-at-startup).

`INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` can stay blank for local dev. We'll start the Inngest dev server separately in step 7. `ERROR_WEBHOOK_URL` and `BLOB_READ_WRITE_TOKEN` are optional.

## 5. Build the design system and run the first migration

The config imports the design system's built manifest, so build it before anything loads the config:

```bash
pnpm --filter ./design-system build
```

(Skip this if you answered no to the reference design system.)

The config sets `push: false`: the schema changes only through migrations, in development too, so the database is empty until you create and apply the first one:

```bash
pnpm --dir apps/web migrate:create initial
pnpm --dir apps/web migrate
```

Then generate the Payload types and the admin import map. Both are committed, and CI regenerates them and fails on a difference:

```bash
pnpm --dir apps/web generate:types
pnpm --dir apps/web generate:importmap
```

Commit the migration and the two generated files together.

## 6. Start Next.js + Payload

```bash
pnpm dev
```

This builds the design system and boots Next.js + Payload. When you see `Ready in <time>`, open http://localhost:3000/admin and create your first user.

> [!NOTE]
> The scaffold's `users` collection gives a new user the `admin` role by default, and that is the role it needs: only admins may create MCP keys (`mcpApiKeyAccess(isAdmin)` in `payload.config.ts`). The other roles in the scaffold are `editor` and `approver`, and approvers are matched by the `groups` field — see [Configuring approvers](../guides/configuring-approvers.md).

## 7. Start the Inngest dev server

In a second terminal:

```bash
npx inngest-cli@latest dev
```

This serves a local Inngest dashboard at http://localhost:8288 and discovers your app's functions at `http://localhost:3000/api/inngest`. Job runs show up here during development; in production you'll connect to the hosted Inngest service.

If you would rather not run Inngest at all, `throughline()` also takes `payloadJobs()` from `@forumone/throughline/jobs/payload`, which runs the same jobs on Payload's own job queue: `suite.plugin` registers them, `app/api/inngest/route.ts` goes, and something has to run the queue — `autoRun` on a long-running server, a per-minute cron calling Payload's run endpoint on Vercel. See [jobs](../reference/throughline/jobs.md).

## 8. Generate an MCP API key

`@payloadcms/plugin-mcp` owns keys, on its own `payload-mcp-api-keys` collection.
One key reaches every tool.

1. In the Payload admin, open **MCP** → **API Keys**
2. Create one document. It is bound to you, the user creating it — the plugin
   does not let you choose. The key inherits your access control and every tool
   logs you as the actor
3. Tick **Enable API Key** and save. Copy the key
4. Nothing goes in `.env.local`. The key lives in your MCP client's config

Scheduled publishes need no key: they run in process, through the same publishing pipeline an editor's publish does.

## 9. What you have now

- A Payload admin at `/admin`
- One MCP endpoint at `/api/mcp`, Bearer-authenticated, carrying every plugin's tools
- An Inngest endpoint at `/api/inngest` serving `suite.jobs`: publish revalidation, scheduled publishing and its daily backstop, approval expiry, the audit echo, the healthcheck, and the three approval emails
- An example `Pages` collection with the `seo` and `policy` groups the publishing pipeline reads
- Cache revalidation named in one place: `apps/web/src/lib/cache-tags.ts` builds every Next cache tag, `Pages` drops its tag on every visible save and delete, and the publish job revalidates the paths `publishing.urls` gives it in `payload.config.ts`. Add an entry there, and the hooks, for each collection you add
- A `users` collection with the `roles` and `groups` fields your approvals `groupResolver` can resolve against — once you write it; the scaffold's returns nobody

## Next

Read [First Claude connection](first-claude-connection.md) to wire your MCP client.

If you want to skip ahead to deploying: [Deploying to Vercel](deploying-to-vercel.md).

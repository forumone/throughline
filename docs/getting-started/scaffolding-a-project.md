# Scaffolding a project

End state: a Payload admin running locally at `http://localhost:3000/admin` with all eight Throughline plugins wired and an Inngest endpoint registering every framework function.

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
| Use the reference design system as a starting point? | yes — gets you a working Components MCP setup immediately |
| Where will this deploy? | `vercel` if you don't know yet |
| Postgres provider? | `neon` if you don't know yet |
| Initialize a git repository? | yes |
| Install dependencies now? | yes |

If you skipped install: run `pnpm install` from the project root.

## 2. Provision Postgres

Create a database and grab a connection string. With Neon:

1. Sign up at https://neon.tech
2. Create a project (free tier)
3. Copy the **pooled** connection string from the dashboard

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
openssl rand -base64 48  # FORMS_IP_HASH_SECRET
```

## 4. Fill in `.env.local`

```bash
cp .env.example .env.local
```

Open `.env.local` and set, at minimum:

- `DATABASE_URI` — your Postgres connection string
- `PAYLOAD_SECRET`, `APPROVAL_TOKEN_SECRET`, `FORMS_IP_HASH_SECRET` — generated above
- `RESEND_API_KEY` — from your Resend dashboard
- `EMAIL_FROM_ADDRESS` — must be on a domain verified in Resend
- `NEXT_PUBLIC_SERVER_URL` — `http://localhost:3000` locally

You don't have to get the list right first time. The first line of
`apps/web/src/payload.config.ts` calls `assertEnvironment` with every plugin's
declared requirements plus the site's own, and anything that loads the config
fails with one error listing every variable still missing or too short, and why
each is needed:

```
Configuration problem: 2 environment variables are missing or invalid. …

  - APPROVAL_TOKEN_SECRET is not set. Signs the approve/decline links in approval emails; …
  - PAYLOAD_SECRET is 12 characters; the minimum is 32. Signs Payload sessions and auth tokens. …
```

Values are never printed. See [Environment variables](../operations/environment-variables.md#checking-everything-at-startup).

`INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` can stay blank for local dev. We'll start the Inngest dev server separately in step 6.

## 5. Start Postgres + Payload

```bash
pnpm dev
```

This boots Next.js + Payload. The first run takes a minute while Payload runs its initial migrations. When you see `Ready in <time>`, open http://localhost:3000/admin and create your first user.

> [!NOTE]
> Give the first user the `admin` role. The Throughline plugins gate write operations on roles like `admin`, `editor`, `approver`, and `form-admin` — see [Configuring approvers](../guides/configuring-approvers.md) for the role taxonomy.

## 6. Start the Inngest dev server

In a second terminal:

```bash
npx inngest-cli@latest dev
```

This serves a local Inngest dashboard at http://localhost:8288 and discovers your app's functions at `http://localhost:3000/api/inngest`. Workflow events fire here during development; in production you'll connect to the hosted Inngest service.

## 7. Generate an MCP API key

`@payloadcms/plugin-mcp` owns keys, on its own `payload-mcp-api-keys` collection.
One key reaches every tool.

1. In the Payload admin, open **MCP** → **Payload MCP API Keys**
2. Create one document. Pick a **User** — required; the key inherits that user's
   access control and every tool logs it as the actor
3. Tick **Enable API Key** and save. The key is displayed once — copy it now
4. Nothing goes in `.env.local`. The key lives in your MCP client's config

Also create one `system` key for the scheduled-publishing workflow and paste it as
`PUBLISHING_SYSTEM_API_KEY` — that one *is* an env var, because Inngest calls the
publish pipeline rather than going through MCP.

## 8. What you have now

- A Payload admin at `/admin`
- One MCP endpoint at `/api/mcp`, Bearer-authenticated, carrying every plugin's tools
- An Inngest endpoint at `/api/inngest` running revalidate, scheduled-publish, expire-approval, audit-echo, healthcheck, email, forms, and integration workers
- An example `Pages` collection with the standard `policy` group attached
- Cache revalidation named in one place: `apps/web/src/lib/cache-tags.ts` builds every Next cache tag, `Pages` drops its tag on every visible save and delete, and the publish workflow revalidates the paths `urlBuilders` gives it in the Inngest route. Add an entry there, and the hooks, for each collection you add
- A `users` collection with a role/group taxonomy your approvers plugin can resolve against

## Next

Read [First Claude connection](first-claude-connection.md) to wire your MCP client.

If you want to skip ahead to deploying: [Deploying to Vercel](deploying-to-vercel.md).

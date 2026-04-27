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

## 7. Generate MCP API keys

The MCP servers authenticate via Bearer tokens stored in Payload's `api-keys` collection.

1. In the Payload admin, open the **API Keys** collection
2. Create one entry per server: `component-server`, `publishing-server`, `approvals-server`, `audit-server`, `forms-server`, `integrations-server`
3. Each entry's `keyValue` field becomes the Bearer token for that server's MCP endpoint
4. Paste each key into `.env.local` (`COMPONENT_SERVER_API_KEY`, `PUBLISHING_SERVER_API_KEY`, etc.) and restart `pnpm dev`

Also create one `system` key for the scheduled-publishing workflow and paste it as `PUBLISHING_SYSTEM_API_KEY`.

## 8. What you have now

- A Payload admin at `/admin`
- Six MCP endpoints running at `/api/<server>/mcp`, each Bearer-authenticated
- An Inngest endpoint at `/api/inngest` running revalidate, scheduled-publish, expire-approval, audit-echo, healthcheck, email, forms, and integration workers
- An example `Pages` collection with the standard `policy` group attached
- A `users` collection with a role/group taxonomy your approvers plugin can resolve against

## Next

Read [First Claude connection](first-claude-connection.md) to wire your MCP client.

If you want to skip ahead to deploying: [Deploying to Vercel](deploying-to-vercel.md).

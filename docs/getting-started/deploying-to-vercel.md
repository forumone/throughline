# Deploying to Vercel

End state: your project running on Vercel with Postgres on Neon, Inngest on Inngest Cloud, and email on Resend. Claude can connect to your production MCP endpoints and operate the live site.

Prerequisite: a working local setup (see [Scaffolding a project](scaffolding-a-project.md)).

## 1. Push to GitHub

```bash
git remote add origin git@github.com:your-org/your-site.git
git push -u origin main
```

## 2. Provision Postgres (Neon)

1. https://neon.tech → New project
2. Note the **pooled** connection string from the dashboard (Neon's pooler avoids exhausting connection slots from serverless functions)
3. You'll paste this as `DATABASE_URI` later

Branch-per-preview: in Vercel's project settings, enable "Neon → Create branch on deploy" if you want every preview to get an isolated database branch.

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
4. Build Command: `pnpm --filter @your-scope/web build` (Vercel runs from the repo root by default)

In **Environment Variables**, add:

```
DATABASE_URI                  postgres://...           # Neon pooled string
PAYLOAD_SECRET                <openssl rand -base64 48>
NEXT_PUBLIC_SERVER_URL        https://your-project.vercel.app

INNGEST_EVENT_KEY             <from Inngest>
INNGEST_SIGNING_KEY           <from Inngest>

RESEND_API_KEY                <from Resend>
EMAIL_FROM_ADDRESS            notifications@your-domain.com
EMAIL_FROM_NAME               Your Site

APPROVAL_TOKEN_SECRET         <openssl rand -base64 48>
FORMS_IP_HASH_SECRET          <openssl rand -base64 48>

# These get filled in after the first deploy — see step 7
COMPONENT_SERVER_API_KEY      <from /admin>
PUBLISHING_SERVER_API_KEY     <from /admin>
APPROVALS_SERVER_API_KEY      <from /admin>
AUDIT_SERVER_API_KEY          <from /admin>
FORMS_SERVER_API_KEY          <from /admin>
INTEGRATIONS_SERVER_API_KEY   <from /admin>
PUBLISHING_SYSTEM_API_KEY     <from /admin>
```

Hit Deploy.

## 6. First admin user

The build runs Payload's migrations on first deploy. When it finishes, visit `https://your-project.vercel.app/admin` and create your admin user.

## 7. Generate production MCP keys

In the production admin's **API Keys** collection, create one entry per server. Paste each into the matching env var in Vercel and redeploy. Same as local development, but with production keys.

> [!WARNING]
> The MCP API keys are the entire authentication boundary for your conversational CMS. Treat them like database credentials. Don't commit them, don't share them, rotate if exposed.

## 8. Connect Claude

Edit your Claude Desktop / Claude Code config to point at the production endpoints — replace `http://localhost:3000` with `https://your-project.vercel.app` in the URLs from [First Claude connection](first-claude-connection.md). Use the production API keys.

## 9. Verify

Ask Claude:

```
List the recent audit events.
```

You should see your own admin login event from a moment ago, plus whatever Payload migrations ran during the deploy. If you get a `401`, the MCP API key is wrong.

## What about cold starts?

Vercel's serverless runtime can introduce 1–3 second cold starts on infrequently-hit endpoints. For Claude-driven workflows this is rarely a problem — Claude is patient. But if you find yourself routinely waiting on cold starts, see [Deployment options](../operations/deployment-options.md) for the Railway / Fly path.

## Health checks

The Workflows package registers a periodic Inngest healthcheck at `createHealthcheckFunction`. By default it pings the Payload API and your DS manifest URL on a cron schedule and writes the result to the audit log. See [Observability](../operations/observability.md) for how to read those events.

## Next

- [Configuring approvers](../guides/configuring-approvers.md) to connect approval groups to your real users
- [Theming emails](../guides/theming-emails.md) to brand the approval email shell
- [Security model](../operations/security-model.md) before you go live

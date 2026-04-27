# Deployment options

Three reasonable shapes for a production Throughline deployment. The framework runs on any Node 20+ host that can serve a Next.js app and reach Postgres + Inngest + Resend.

## Option 1: Vercel (default)

What the scaffolder targets. Pros and cons:

| Pro | Con |
| --- | --- |
| Zero-config setup with the GitHub integration | Cold starts on infrequent endpoints (1–3s) |
| Per-PR preview deploys with their own URLs | Lambda execution time limits (default 10s, configurable to 60s) |
| Built-in image optimization | No persistent in-memory state between requests |
| Cheap at low traffic | Per-invocation pricing scales with traffic |

Cold starts matter mostly for the MCP endpoints. Claude calls them sporadically; cold starts make the conversation feel laggy. Two ways to mitigate:

- Use Vercel's "Function Region" set to the region closest to your database
- Set `NEXT_PUBLIC_PAYLOAD_PRELOAD=true` (or use a Vercel cron) to keep one warm instance alive

For most engagements, Vercel's tradeoffs are right. The only common reason to leave Vercel is sustained-load workflows (the Inngest workers themselves run on Inngest, not on Vercel — so that's not actually a Vercel concern).

## Option 2: Long-running container (Railway / Fly / Render / your own)

When cold starts matter and you want one always-warm process:

| Pro | Con |
| --- | --- |
| No cold starts; consistent latency | Pay for an always-on container, even at low traffic |
| In-memory caches survive between requests | More moving parts to manage (logs, restarts, scaling) |
| Predictable resource usage and costs | No automatic preview deploys |

The container itself is just `node ./apps/web/.next/standalone/server.js` (Next.js's standalone build). Set the same environment variables you'd set on Vercel. Use the platform's healthcheck to point at a route that returns 200 from the Inngest endpoint or a custom `/api/health` you write.

Recommended targets:

- **Railway** — simplest to set up; good for first-deployment teams
- **Fly.io** — more power, more configuration; good for teams who already use it
- **Your own ECS/GKE/Kubernetes cluster** — if you have one and the operational expertise to run it

Scaling: Throughline is stateless except for the database. Horizontal scaling is "run more containers." Use a load balancer or platform-provided routing.

## Option 3: Hybrid — Vercel front, separate worker process

For applications with heavy off-cycle workloads, you can split:

- **Vercel** — the user-facing site and Payload admin
- **Separate worker** — a long-running Node process running an Inngest connector, a separate cron runner, or other infrastructure

You'd do this when:

- Your integrations do heavy work (large CRM syncs, video processing) and you want them isolated from request-path latency
- You need long-running migrations / imports that exceed Vercel function timeouts
- You have on-prem services Vercel can't reach without a hardcoded VPC

Throughline's plugin architecture makes this straightforward — the plugins themselves run inside the web app; the Inngest workers can run anywhere reachable from Inngest.

## Choosing a database host

Both compute paths work with any Postgres. Three common choices:

- **Neon** — serverless Postgres. Branch-per-preview gives every Vercel preview its own DB branch. Default recommendation for Vercel deployments.
- **Supabase** — pooled Postgres + extra services. Use the pooled connection string; don't share a connection pool across runtimes.
- **Self-hosted (RDS, Cloud SQL, your own)** — when policy requires it, when you need a region Neon/Supabase don't serve, or when you already have one.

Connection pool sizing: Vercel Lambda invocations open and close connections rapidly. Neon's pooler is built for this; raw self-hosted Postgres is not. Always use a pooler (PgBouncer or equivalent) in front of self-hosted Postgres if you're running on Vercel.

## Inngest

Inngest's hosted service is the default. Free tier covers small-to-medium development; Pro tier needed for production volume. Self-host with `inngest-cli` if you have a strong reason to (regulatory, air-gapped environment) — same code runs on either.

## Resend

Resend has no self-hosted version. If your compliance requires self-hosted email:

- Replace `@forumone/throughline-email`'s Resend client with your own SMTP-based or Postmark/SendGrid-based client
- The Email plugin's `client` option accepts any value with the same shape (`send({ to, subject, html, text })`)

For most clients, Resend is the right answer. Cost is low; deliverability is good; the dashboard shows every send.

## What to measure before changing platforms

If you're considering moving from Vercel to long-running container, instrument first:

- **p95 cold-start time on MCP endpoints** — the symptom most cited; usually 1–2s
- **Cold-start frequency** — how often does a request actually pay for a cold start?
- **End-to-end MCP call latency from the client** — are cold starts actually the bottleneck, or is it Postgres?

It's common to assume cold starts are the problem when database round-trips actually dominate. Verify before migrating.

## Useful Vercel-specific settings

- **Function memory** — bump from default 1024MB to 2048MB if you see OOM errors during publishes (they instantiate Payload + run validators + serialize content). Costs a bit more per invocation.
- **Function timeout** — bump to 30s on the publish endpoint; the seven-stage pipeline plus integration calls can exceed 10s on a slow database.
- **Edge config / KV** — the framework doesn't use these by default. If you add caching, prefer Postgres-backed caches over Vercel KV; you keep one source of state.
- **Project linking** — link your repo's Vercel project to the GitHub `main` branch for production and PR branches for previews. Default behavior is correct.

## What you don't need

- A Redis. Inngest provides queueing; rate-limiting and idempotency live in Postgres tables. Nothing in core requires Redis. (Add it if you have other reasons.)
- A separate background-jobs service. Inngest is that.
- A CDN beyond what your platform provides. Vercel/Railway/Fly each include one. Cloudflare in front works fine.
- A separate session store. Payload uses cookie-based sessions backed by the database.

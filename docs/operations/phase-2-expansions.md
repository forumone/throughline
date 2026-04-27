# Phase 2 expansions

What's deliberately deferred. Each item here is something Throughline core doesn't ship today; each has a reasonable path forward when client requirements demand it.

These are reference notes, not commitments. When a client need pushes one of these into "necessary," the work happens in the client project first; if the solution is generic enough, it eventually graduates to core.

## SSO / Identity provider integration

**Why deferred**: every org has a different IDP and different group-membership conventions. A built-in SSO surface would either be too narrow (Okta-specific) or too configurable (a meta-framework on top of a meta-framework).

**Path forward**: use Payload's auth plugin ecosystem.

- `@payloadcms/plugin-cloud-sso` for hosted Payload deployments
- `next-auth` (NextAuth.js) wired into Payload via a custom auth strategy
- Roll your own with Payload's `auth.strategies` extension point

Throughline's `groupResolver` is agnostic to the auth source — it reads from whatever user shape your auth produces. Once SSO writes group memberships into the user record, the rest works without modification. See [Configuring approvers](../guides/configuring-approvers.md), Option C.

## Search

**Why deferred**: most content sites need search, but the right answer depends heavily on volume, language requirements, and editorial features (faceting, synonyms). Anything baked in would be wrong for someone.

**Path forward**: layer on top of the published frontend, not on top of Payload.

- **Algolia / Typesense / Meilisearch**: write an Inngest function that subscribes to `content/page.published` and indexes the page. Call the search service from your frontend.
- **Postgres FTS**: cheaper if you're staying in-database. Add a `tsvector` column on your `pages` collection via a Payload hook; query with the SQL the standard FTS docs show.
- **Site-wide build-time indexing**: for static sites, build a JSON index at deploy time and query from the client (FlexSearch, Lunr).

Throughline doesn't gate which choice you make. The publish event is the integration point.

## Caching

**Why deferred**: Next.js handles HTTP caching; Inngest handles work caching. Beyond that, "cache layer" usually means something specific to your traffic shape (hot pages, expensive computations) and the framework can't predict it.

**Path forward**: the Workflows package ships `createRevalidateOnPublishFunction` which calls `revalidatePath` on publish. That handles Next.js's data cache. For more:

- **Component output cache**: wrap expensive renderers in `unstable_cache`
- **External data cache**: Redis or Cloudflare Workers KV in front of expensive third-party API calls
- **CDN cache**: configure cache headers on your platform; the framework doesn't gate

The framework's stance: cache invalidation is the publish event. Whatever caching you add subscribes to that event for invalidation.

## Observability stack

**Why deferred**: the audit log + Inngest dashboard + Resend dashboard cover most operational debugging. Adding a full APM stack (Datadog, Honeycomb, Sentry) is real work and costs real money — clients should opt in deliberately.

**Path forward**:

- **Sentry** — error tracking. Wire Sentry's Next.js SDK in `next.config.mjs`; add `Sentry.captureException` in your Inngest workers.
- **OpenTelemetry** — distributed tracing. Both Payload and Next.js have OTel instrumentation. Wire to your collector.
- **Axiom / Logflare** — log aggregation. Pipe Vercel/Railway logs to your provider.
- **Datadog APM** — full-stack APM. Significant cost; appropriate for high-traffic sites.

The framework writes structured audit rows; an observability layer subscribes to those (via the `audit/event.recorded` Inngest event) and forwards them to your stack. See [Observability](observability.md).

## Workflow visualization for non-developers

**Why deferred**: showing approval state, scheduled publishes, and integration health in a unified marketer-facing UI is a real product, not a plugin. Marketers can read the audit log via the admin or ask Claude; that's reasonable for early adoption.

**Path forward**: build a custom Payload admin route with the views you want. Payload supports custom React routes alongside its standard collection views. Pull data from the audit log + scheduled-publish queue + integration health table.

Or: an external dashboard (Retool, Metabase, your own) that reads from Postgres directly. Faster to ship, easier to share with non-developers.

## Versioning UI

**Why deferred**: Payload supports drafts and versions out of the box. The framework uses them; adding a richer "diff between versions, click to revert" UI is downstream of basic adoption.

**Path forward**: Payload's admin already shows version history per document. For richer diffing:

- A custom admin route showing field-level diffs
- Integration with a tool like Diffchecker or your own diff component

The publishing pipeline's `rollback` tool lets Claude revert to a prior version. Marketers can ask "show me what changed since the last publish" via Audit MCP.

## Multi-tenancy

**Why deferred**: most clients are single-tenant. Multi-tenancy (one Payload instance serving many client sites) needs a coherent model for data isolation, billing, role mapping — none of which Throughline currently expresses.

**Path forward**: don't do it inside one Payload. Run one Throughline project per tenant. The plugin architecture and CLI scaffolder make this practical: each tenant gets a fresh repo, deploys independently, has its own database. Shared package upgrades happen via `pnpm update`.

If you really need shared infrastructure across tenants, a custom orchestration layer (Vercel Multi-Project + a parent admin) is the right shape. Not in Throughline.

## Localization (i18n)

**Why deferred**: Payload supports localized fields out of the box. Throughline plugins are locale-agnostic (the audit log records locale; the publish pipeline runs per-locale-version). What's deferred is built-in tooling for translation workflows.

**Path forward**: use Payload's localized fields + a translation provider:

- **Smartling / Phrase / Lokalise**: wire via Payload hooks that fire on draft save
- **Manual translation in admin**: rely on Payload's built-in localized field UI
- **AI-assisted with Claude**: an MCP tool that translates a draft from source locale to a target locale, returning a tracked-changes diff

The publish pipeline runs per-locale; each locale's draft can publish independently or together (controlled by your collection config).

## Compliance frameworks

**Why deferred**: HIPAA, PCI-DSS, SOC 2 are organizational efforts, not framework features. Throughline can be operated in a compliance-friendly way; it doesn't ship compliance certifications.

**Path forward**:

- **Audit log retention policies** — already supported; configure per your retention requirement
- **Field-level encryption** — Payload field hooks can transparently en/decrypt
- **Tamper-evident audit log** — fan out audit rows to an append-only system (CloudTrail, Datadog audit, an internal hash-chain)
- **Access reviews** — query the `api-keys` collection on a schedule; alert on long-lived keys

Most compliance work is platform/process, not code. Throughline's design (structured audit, encrypted secrets, gated publish) is consistent with audit-friendly operations.

## What we won't add to core

Some things have come up but are out of scope by design:

- **A live preview UI in the admin** — Payload has one; if you want a fancier one, build it as a Payload admin extension, not in Throughline
- **A built-in CDN** — platforms include CDNs; the framework wouldn't ship a better one
- **Built-in analytics** — every site has different needs; pick one and wire on the publish event
- **A graphical workflow editor** — Inngest's dashboard is the workflow UI; building a second is non-additive

## When to lobby for a feature in core

A feature belongs in core when:

- Multiple clients are likely to need it
- The right shape is reasonably stable (not "we'll know in 6 months")
- It composes with the existing plugin architecture rather than fighting it
- It doesn't lock anyone into a specific provider

If you're proposing a new core feature, the path is: ship it as a custom plugin in your client project first, see what real usage looks like, then propose it as a PR with the worked example as evidence.

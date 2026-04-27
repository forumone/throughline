# Client-agnostic core

Throughline core is one repo: `forumone/throughline` on GitHub, published as `@forumone/throughline-*` on npm. Client projects are *separate* repos that depend on the published packages. There's a deliberate seam between the two — and the seam is configuration, not code.

## Two tracks

```
   ┌────────────────────────────────────┐    ┌────────────────────────────────┐
   │   forumone/throughline (core)      │    │   forumone/acme-website        │
   │                                    │    │                                │
   │   packages/                        │    │   apps/web/                    │
   │     core                           │    │     payload.config.ts ─────────┼──┐
   │     components                     │    │     app/api/inngest/route.ts   │  │
   │     publishing                     │    │   packages/                    │  │
   │     approvals                      │    │     design-system              │  │
   │     audit                          │    │     content                    │  │
   │     ...                            │    │     brand                      │  │
   │                                    │    │                                │  │
   │   apps/playground (smoke test)     │    │   .env.local                   │  │
   │   docs/                            │    │   ...                          │  │
   └────────────────────────────────────┘    └────────────────────────────────┘  │
                  │                                                              │
                  │ npm                                                          │
                  └─────────────────────────────────────────────────────────────-┘
```

Core is a framework. The client repo is an application using that framework. They're separate concerns under separate version control.

## What lives in core

- The eight Throughline plugins, each with its options surface and its capabilities
- Generic helpers (audit log writer, MCP handler, Inngest client factory, env loader)
- The reference design system + design contract schema
- The CLI scaffolder
- These docs

Core knows nothing about Forum One, any specific client, any specific brand, or any specific content model. It can't — it's a single artifact installed into many projects.

## What lives in the client project

- Real collections (your content model)
- Real groups + a real `groupResolver` (your user/SSO mapping)
- Real allowlisted destinations (the things forms can email or webhook to)
- Real integrations (your CRM, your analytics)
- A brand layer on top of the reference DS, or your own DS that satisfies the same contract
- Frontend rendering — the published site itself
- Custom workflows (Slack notifications, custom analytics, your own crons)
- Local infra config (Vercel project, Neon db, Resend domain)

All of this is wired through Throughline plugin options. The only "code" connection is the import statements in `payload.config.ts` and `apps/web/src/app/api/inngest/route.ts`.

## Why the seam matters

Three reasons.

**Reuse across clients.** Forum One will run multiple Throughline projects. They share the framework but diverge on day two. The seam means an upgrade to core lands in `pnpm update` for every client at once. No fork, no per-client patching.

**Upstreaming has a place.** When a client project develops something genuinely generic (a new healthcheck, a new accessibility check, a new email template), it can graduate to core. The seam tells you which side of the boundary code currently sits on, which informs the move.

**Contributors don't need client context.** Someone fixing a bug in `@forumone/throughline-publishing` doesn't need credentials to a client environment. Tests run against fakes; the playground app is a self-contained smoke test. This is what makes the framework maintainable on a multi-engineer team.

## The fork question

It's tempting, when a client need feels urgent, to just edit core. Don't. The cost of a fork is enormous and easy to underestimate:

- Future core upgrades become merges
- Other clients can't benefit from the change
- The "is this in core or in the fork?" question recurs on every bug
- The fork drifts; eventually nobody can say what's "stock"

If something in core is missing, the right move is to:

1. Solve it in your client project as a custom plugin or workflow
2. If the solution is generic enough, propose adding a hook to core to support it
3. If the solution belongs in core wholesale, propose it as a PR

A custom plugin in a client project is just a Payload plugin. The framework already supports them — the registry, the symbol-keyed cross-plugin communication, the event taxonomy. Use those primitives before reaching for a fork.

## Customization patterns

| Need | Where it goes |
| --- | --- |
| New collection | Client project's `payload.config.ts` |
| New approval group | Client project's `approvalsPlugin` options |
| New AccessibilityCheck | Client project, registered with `publishingPlugin({ accessibilityChecks })` |
| New Inngest worker | Client project's `app/api/inngest/route.ts` functions array |
| New form destination type | Client project's `formsPlugin` options |
| New integration (CRM, analytics) | Client project, registered with `integrationsPlugin` |
| New email template | Client project, passed to `emailPlugin({ templates })` |
| New brand colors / fonts | Client project's `componentsPlugin({ brand: { tokens } })` |
| New design system component | Client project's design-system package |
| Bug fix in a Throughline plugin | Core PR |
| New plugin entirely | Core (after upstream conversation) |

## What about monorepos?

Some Forum One clients prefer monorepos that include core as a workspace package rather than a published dependency. This is supported but not the default — the published-dependency path is simpler to upgrade and easier to reason about. If you go monorepo, treat the inner `packages/core` like a third-party dependency anyway: PRs against core go through the core repo's review process; clients consume releases.

## Where to look in code

- `apps/playground/` (in core) — a tiny client project used to smoke-test core's plugins. Useful template for what a real client project looks like.
- A scaffolded project (`pnpm create @forumone/throughline foo`) — produces the canonical client structure.
- `docs/spec/00-README.md` — the spec's articulation of "core vs project" from the build plan.

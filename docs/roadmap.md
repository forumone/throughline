# Roadmap

Running status tracker for the core build. Each phase has a full spec under `docs/spec/`. Check boxes off as you land each acceptance criterion so someone picking this up after a break (including future-you) can see exactly where we are.

> **Naming note.** The specs refer to packages as `@forumone/claude-cms-*`. The actual package names in this repo use `throughline`. Mentally substitute when reading the specs.

## Phase index

| Phase | Title | Status |
| --- | --- | --- |
| [C0](#c0--monorepo-scaffold) | Monorepo Scaffold | ✅ Done |
| [C1](#c1--plugin-architecture) | Plugin Architecture | ✅ Done |
| [C2](#c2--design-contract-package) | Design Contract Package | ✅ Done |
| [C3](#c3--reference-design-system) | Reference Design System | ⏳ Next |
| [C4](#c4--core-plumbing-package) | Core Plumbing Package | ⏸ Not started |
| [C5](#c5--component-server) | Component Server | ⏸ Not started |
| [C6](#c6--publishing-server) | Publishing Server | ⏸ Not started |
| [C7](#c7--approvals-server) | Approvals Server | ⏸ Not started |
| [C8](#c8--audit-query-server) | Audit Query Server | ⏸ Not started |
| [C9](#c9--integrations-server) | Integrations Server | ⏸ Not started |
| [C10](#c10--workflows-package) | Workflows Package | ⏸ Not started |
| [C11](#c11--email-package) | Email Package | ⏸ Not started |
| [C12](#c12--forms-package) | Forms Package | ⏸ Not started |
| [C13](#c13--cli-scaffolder) | CLI Scaffolder | ⏸ Not started |
| [C14](#c14--documentation-site) | Documentation Site | ⏸ Not started |

---

## C0 — Monorepo Scaffold

Spec: `docs/spec/C0-monorepo-scaffold.md`

Goal: Turborepo + pnpm workspaces + changesets + shared tooling + CI that builds, tests, and publishes to npm on tagged releases.

- [x] Repo at `github.com/forumone/throughline` with Turborepo + pnpm workspaces
- [x] Shared TypeScript, ESLint, Prettier configs exist as internal packages
- [x] Changesets initialized and configured for `@forumone` scope
- [x] CI workflow runs build, typecheck, lint, test on every PR
- [x] Release workflow connected to npm (trusted publishing via OIDC); opens release PRs on changeset merges
- [x] README, CONTRIBUTING, LICENSE exist
- [x] `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all run cleanly from root
- [x] Branch protection on main requires PR + CI
- [ ] npm publish round-trip verified end-to-end (deferred — will be exercised by the first real published package in C2)

Notes:

- Skipped C0.8/C0.9 smoke-test round-trip in favor of exercising the publish pipeline with the first real package (C2).
- Removed the scaffolded `smoke-test` package in PR #6.

## C1 — Plugin Architecture

Spec: `docs/spec/C1-plugin-architecture.md`

Goal: Define the Payload plugin contract every core package satisfies — the shape, the MCP mounting pattern, the composition model, the shared options contract.

- [x] `@forumone/throughline-plugin-contract` exists as a private workspace package
- [x] `CorePlugin`, `BaseCorePluginOptions`, `McpToolDefinition`, `McpToolContext` exported
- [x] Example plugin pattern (`examplePlugin`) compiles and shows every required step
- [x] Plugin registry (`register`, `has`, `get`, `list`, `requireCapability`) implemented
- [x] `apps/playground/` exists with Next.js 16 + Payload 3.83, runs locally against Postgres
- [x] Example plugin imported into the playground and the app boots (verified end-to-end by creating the first admin user)
- [x] `docs/plugin-composition.md` written
- [x] `docs/building-plugins.md` written
- [x] `pnpm build`, `pnpm typecheck`, `pnpm lint` all pass from root

Notes:

- Packages use `throughline` not `claude-cms`.
- Example's global hook uses `hooks.afterError` (the only top-level `Config.hooks` in Payload v3) rather than the spec's `hooks.afterChange`.
- Playground Postgres runs on `:5433` to avoid collision with native Postgres installs.

## C2 — Design Contract Package

Spec: `docs/spec/C2-design-contract.md`

Goal: Build the package that defines what it means to be an AI-ready design system. Exports the Zod schema for component contracts, the manifest format, the manifest loader, the CI lint rules. Every future design system satisfies this.

- [x] `packages/design-contract/` scaffolded (package.json, tsconfig, vitest config, src)
- [x] `ComponentContractSchema` defined with every section (identity, composition, content, tokens, accessibility, examples, behavior)
- [x] `ManifestSchema` defines the aggregated JSON with `contractVersion` literal-gated at `1.0.0`
- [x] `LoadedManifest` exposes `getComponent`, `requireComponent`, `listComponents`, `listByCategory`, `listCategories`, `getToken`
- [x] `loadManifest` validates and returns `LoadedManifest`; throws with path-qualified errors
- [x] `loadManifestFromUrl` fetches and validates a remote manifest
- [x] `lintManifest` reports errors (unknown components/tokens/story IDs) and warnings (empty anti-examples, brief intent)
- [x] `formatLintIssues` and `assertManifestClean` helpers
- [x] Main entry exports schema + manifest + loader; `/lint` subpath exports lint helpers
- [x] 43 tests across schema/manifest/loader/lint; all passing
- [x] README with authoring, loading, linting examples
- [x] Changeset committed; package ready to publish as 0.1.0

Notes:

- Package name is `@forumone/throughline-design-contract` (spec says `claude-cms-design-contract`).
- Recursive `ContentField` schema uses `z.lazy` with explicit `z.ZodType<Output, Def, Input>` three-generic form because `exactOptionalPropertyTypes: true` + `.default(false)` on `required` make input and output diverge.
- `_fixtures.ts` holds test fixtures and is excluded from the emitted `dist/`.

## C3 — Reference Design System

Spec: `docs/spec/C3-reference-ds.md`

Goal: A brand-neutral design system with 10–12 components, full contracts, generated manifest, Storybook, and CI validation. Test fixture for core + demonstration of contract compliance + starting template for clients without their own DS.

## C4 — Core Plumbing Package

Spec: `docs/spec/C4-core-plumbing.md`

Goal: The foundation every server package depends on — audit log, MCP auth pattern, shared types beyond the plugin contract, Inngest client factory, env handling, `_meta` convention. Unblocks C5–C9 to be developed in parallel.

## C5 — Component Server

Spec: `docs/spec/C5-component-server.md`

Goal: First custom MCP server. Exposes a design system manifest as conversational primitives (list components, get contracts, suggest components, validate compositions, detect anti-patterns) against any contract-compliant DS.

## C6 — Publishing Server

Spec: `docs/spec/C6-publishing-server.md`

Goal: The framework's trust boundary. Policy-gated publish pipeline wrapping Payload's update: composition validation, a11y checks, required-field checks, embargo, approval gating, downstream event orchestration.

## C7 — Approvals Server

Spec: `docs/spec/C7-approvals-server.md`

Goal: Workflow + conversational approvals. Collection schema, MCP tools, HMAC action tokens, and the approval resolver the Publishing Server consumes.

## C8 — Audit Query Server

Spec: `docs/spec/C8-audit-query-server.md`

Goal: Expose the audit log (written by C4) as conversational query tools so Claude can answer "what did I change this week?", "who published the homepage?", etc. Small package, high leverage.

## C9 — Integrations Server

Spec: `docs/spec/C9-integrations-server.md`

Goal: Plugin architecture for connecting Payload to external systems. `Integration` interface, registry, per-instance config collection, MCP tools, and a generic outbound-webhook integration as the first concrete example.

## C10 — Workflows Package

Spec: `docs/spec/C10-workflows.md`

Goal: Composable Inngest functions for common async work (revalidation on publish, scheduled publishes, stale-approval expiry, audit echo, healthchecks). Clients import what they want and merge into their Inngest endpoint.

## C11 — Email Package

Spec: `docs/spec/C11-email.md`

Goal: Resend wrapper, React Email base layout with brand tokens, transactional templates (approval request / decision / expired), and Inngest functions subscribing to C10's audit-echo events.

## C12 — Forms Package

Spec: `docs/spec/C12-forms.md`

Goal: Policy-aware forms. Wraps Payload's Form Builder with privacy notices, a11y, spam protection, destination allowlist, submitter confirmation. MCP tools for conversational create/update/query. Public submission endpoint + Inngest fan-out.

## C13 — CLI Scaffolder

Spec: `docs/spec/C13-cli.md`

Goal: `create-throughline` CLI. `pnpm create @forumone/throughline my-client-site` → ready-to-run monorepo, env stubs, example collection + DS reference, first-deployment checklist. Zero to "Claude editing content" in under an hour.

## C14 — Documentation Site

Spec: `docs/spec/C14-docs.md`

Goal: The documentation site that makes the framework usable by someone who didn't build it — architecture, getting started, per-package API reference, customization guides, DS-contract authoring guide. Deploys automatically as core evolves.

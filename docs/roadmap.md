# Roadmap

Running status tracker for the core build. Each phase has a full spec under `docs/spec/`. Check boxes off as you land each acceptance criterion so someone picking this up after a break (including future-you) can see exactly where we are.

> **Naming note.** The specs refer to packages as `@forumone/claude-cms-*`. The actual package names in this repo use `throughline`. Mentally substitute when reading the specs.

## Phase index

| Phase | Title | Status |
| --- | --- | --- |
| [C0](#c0--monorepo-scaffold) | Monorepo Scaffold | ✅ Done |
| [C1](#c1--plugin-architecture) | Plugin Architecture | ✅ Done |
| [C2](#c2--design-contract-package) | Design Contract Package | ✅ Done |
| [C3](#c3--reference-design-system) | Reference Design System | ✅ Done |
| [C4](#c4--core-plumbing-package) | Core Plumbing Package | ✅ Done |
| [C5](#c5--component-server) | Component Server | ✅ Done |
| [C6](#c6--publishing-server) | Publishing Server | ✅ Done |
| [C7](#c7--approvals-server) | Approvals Server | ✅ Done |
| [C8](#c8--audit-query-server) | Audit Query Server | ⏳ Next |
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
- [x] npm publish round-trip verified end-to-end — `@forumone/throughline-design-contract@0.2.0` and `@forumone/throughline-reference-ds@0.2.0` live on npm via trusted publishing (OIDC)

Notes:

- Skipped C0.8/C0.9 smoke-test round-trip in favor of exercising the publish pipeline with the first real package (C2).
- Removed the scaffolded `smoke-test` package in PR #6.
- Since `@forumone` scope-level trusted publishing isn't available, every new package needs a one-time bootstrap: placeholder publish via `npx setup-npm-trusted-publish <name> --access public`, then configure a trusted publisher in the npm web UI (`npmjs.com/package/<name>/access` → GitHub Actions → owner `forumone`, repo `throughline`, workflow `release.yml`). Done once for all 12 packages currently planned (10 pre-provisioned for C4–C13, plus the 2 already published).

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

- [x] `packages/reference-ds/` scaffolded with Storybook 10, vitest + jsdom + Testing Library, shared tsconfig/eslint
- [x] 12 components: Hero, SectionIntro, Prose, MediaBlock, Card, CardGrid, CTASection, Stats, FAQ, Quote, Divider, Spacer
- [x] Every component has React + CSS Modules + Storybook stories + unit tests + `ComponentContract`
- [x] Token system (colors, typography, spacing, radii) as TS constants with `build-tokens-css.ts` generating `tokens.css` + `prefers-color-scheme: dark` override
- [x] `scripts/build-manifest.ts` discovers contracts, validates against `ManifestSchema`, writes `dist/manifest.json`
- [x] `scripts/validate.ts` runs `lintManifest` against the manifest and consumes `storybook-static/index.json` for storyId resolution
- [x] Storybook builds cleanly with `addon-a11y`; index.json contains every story referenced by a contract
- [x] Main entry exports all 12 components; `./manifest`, `./styles.css`, `./tokens` subpath exports
- [x] Unit tests for every component (render + key semantics/ARIA)
- [x] README, changeset for 0.1.0
- [x] `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` green from root
- [x] CI runs `build-storybook` + `validate` as a dedicated parallel job
- [ ] Storybook deployment (Vercel or Chromatic) — pending account/tooling decision; tracked as a standalone follow-up

Notes:

- Package name is `@forumone/throughline-reference-ds` (spec says `claude-cms-reference-ds`).
- Storybook `^10.3.5` on `@storybook/react-vite`; spec's `addon-essentials` is rolled into SB 10 core and not listed separately.
- CSS Modules type declaration lives at `src/css-modules.d.ts`.
- Contracts explicitly set defaulted fields (`behavior`, `antiExamples`) because the output type of `ComponentContract` is stricter than the input type under `exactOptionalPropertyTypes: true`.
- Storybook story IDs derive from each story's `title`; multi-word components use space-separated titles (`'Section Intro'` → `section-intro--default`) so the IDs match the contracts.
- Gesso (`forumone/nextjs-project`) was not reused: only 5/12 components overlap, it's coupled to `@storybook/nextjs`, has no contracts, and lives inside a monolithic Next.js template. It informed naming conventions only. The lint integration pattern from the previous note (Storybook's `index.json` → `availableStoryIds`) is wired into `scripts/validate.ts`.

## C4 — Core Plumbing Package

Spec: `docs/spec/C4-core-plumbing.md`

Goal: The foundation every server package depends on — audit log, MCP auth pattern, shared types beyond the plugin contract, Inngest client factory, env handling, `_meta` convention. Unblocks C5–C9 to be developed in parallel.

- [x] `packages/core/` scaffolded as a publishable package; subpath exports for `./audit`, `./auth`, `./events`, `./mcp`, `./env`
- [x] Audit log: `auditPlugin` (extends Payload config, attaches writer via `Symbol.for`, registers in plugin registry), `createAuditWriter` (fire-and-forget, optional Inngest emission), `createAuditCollection` (immutable, indexed for common queries), `getAuditWriter` for peer plugins
- [x] MCP auth: `createApiKeysCollection` (admin-only access, SHA-256 hashed keys, raw key surfaced once via `__rawKey`), `createBearerTokenAuthenticator` (validates against hashed storage, expiry-aware)
- [x] Events: `CoreEvents` taxonomy + `FrameworkEvents` module-augmentation seam, `createInngestClient` factory
- [x] MCP handler: `createMcpHandler` (JSON-RPC over HTTP, auth, tool dispatch, error formatting, `zod-to-json-schema` for `tools/list`)
- [x] `_meta` helpers: `McpMetaSchema` and `withMeta(shape)` so plugin authors can attach prompt/reasoning context to any tool input
- [x] Env conventions: `ENV_VARS` constants, `validateBaseEnv`, `requireEnv`, `optionalEnv`
- [x] Logger: `defaultLogger` + `createNamedLogger` with tagged scoping
- [x] Utilities: `shallowDiff`, `generateId`
- [x] Re-exports of common contract types (`CorePlugin`, `Logger`, `McpToolDefinition`, etc.) so consumers don't need to import the plugin-contract package separately
- [x] 71 unit tests covering every subsystem; fire-and-forget audit semantics tested explicitly
- [x] Playground app wires `auditPlugin` and `createApiKeysCollection`, exercises the architecture end-to-end

Notes:

- Package name `@forumone/throughline-core` (spec said `claude-cms-core`).
- Inngest pinned to `^4.0.0`, not the spec's `^3.0.0` (Inngest 3 is end-of-life). The constructor's `signingKey` field was removed in v4 — signing is set via env on the serve handler instead — so the factory's option list is shorter than the spec's.
- `FrameworkEvents` has an empty body (it's the augmentation seam); the eslint `no-empty-object-type` rule is suppressed at the declaration with an explanatory comment.
- Hashing uses Web Crypto (`crypto.subtle.digest`) so the same code runs in Node and edge runtimes.

## C5 — Component Server

Spec: `docs/spec/C5-component-server.md`

Goal: First custom MCP server. Exposes a design system manifest as conversational primitives (list components, get contracts, suggest components, validate compositions, detect anti-patterns) against any contract-compliant DS.

- [x] `packages/components/` scaffolded as a publishable package with a single main entry; subsystem files live in `src/`
- [x] Plugin options: discriminated `ManifestSource` union (object | url | payload-collection) + matcher config; Zod schema with path-qualified errors
- [x] Manifest loader supports all three sources; URL source honors `refreshInterval` and `refresh()` always re-fetches; Payload-collection source falls back to the doc itself when no `data` wrapper is present
- [x] TF-IDF matcher with `intent` weighted twice over description; tokenizer drops short tokens + a small stop-word list; verified against the reference DS for editorial intents
- [x] Composition validation: `forbiddenAdjacent`, `maxPerPage`, `requiredSiblings` (warning), unknown components, unknown variants
- [x] Anti-pattern detection: per-component `antiExamples` matched by structural heuristics (multiple-class, end-of-page); de-duplicated per (blockIndex, pattern)
- [x] Seven MCP tools: `list_components`, `get_contract`, `get_variants`, `get_tokens`, `suggest_for_intent`, `validate_composition`, `find_anti_pattern`
- [x] Action tools take `AuditWriter` as a constructor dep so they're unit-testable without a Payload instance; every consequential call writes a `design.*` audit record with `_meta.userPrompt` / `_meta.reasoning` forwarded
- [x] Plugin uses `requireCapability('audit-log')` and fails at init when audit isn't registered; eager manifest load surfaces source errors at deploy time, not at first request
- [x] MCP handler attached to Payload via Symbol; endpoint at `${routePrefix}/mcp` (default `/api/components/mcp`) fetches the handler at request time
- [x] 53 tests passing — option validation, manifest loading across all three source types (with TTL behavior), TF-IDF ranking against the real reference-ds manifest, composition rules, anti-pattern detection, every tool's happy path and error cases
- [x] Playground composes `componentsPlugin` after `auditPlugin` and points it at `@forumone/throughline-reference-ds/manifest`; build passes

Notes:

- Embeddings matcher deferred per the spec's note: "Don't ship half-working embeddings." TF-IDF lands now; the matcher interface is strategy-agnostic so swapping in embeddings won't change the tool surface.
- JSON-imported manifests need an `as unknown as Manifest` cast because TS doesn't widen JSON literal types to the schema's tuple types (e.g. `placement`). The plugin's Zod validation enforces the actual shape at load time.
- Action tools take their `AuditWriter` as a constructor dep instead of calling `getAuditWriter` inside the handler. Cleaner composition, easier unit-testing.

## C6 — Publishing Server

Spec: `docs/spec/C6-publishing-server.md`

Goal: The framework's trust boundary. Policy-gated publish pipeline wrapping Payload's update: composition validation, a11y checks, required-field checks, embargo, approval gating, downstream event orchestration.

- [x] `packages/publishing/` scaffolded with options surface (PublishableCollection / AccessibilityCheck / ApprovalResolver), Zod-validated config, and resolveCollection helper
- [x] Three built-in accessibility checks (alt text / heading hierarchy / link labels) + `accessibilityChecks` option for client extensions
- [x] Seven-step pipeline (exist / composition / accessibility / required-fields / embargo / approval / execute) with `runPublishPipeline` and `runPreflightPipeline`
- [x] Composition step calls the components plugin's validator in-process via `Symbol.for('@forumone/throughline/components-validator')`
- [x] `beforeChange` hook injected on every publishable collection rejects direct `_status` writes unless the request carries the bypass context flag
- [x] Five MCP tools: `publish`, `unpublish`, `schedule_publish`, `get_publish_status` (read-only), `rollback`. Each takes `_meta` and writes `publishing.*` audit records (except `get_publish_status`).
- [x] Plugin uses `requireCapability('audit-log')` and fails at init when audit isn't registered
- [x] MCP handler attached to Payload via Symbol; endpoint at `/api/publishing/mcp`
- [x] 80 tests covering options validation, every accessibility check, every pipeline step, the runner, the hook, and every tool's happy/error paths
- [x] Companion change in `@forumone/throughline-components`: composition validator now exposed via Symbol so peer plugins can call it without round-tripping through MCP. Patch bump.
- [x] Playground composes `publishingPlugin` against a Pages collection that has seo / policy / layout / publishedAt / scheduledPublishAt fields; build passes

Notes:

- Inngest pinned to `^4.0.0` (matches the rest of the framework; spec said `^3.0.0` but that major is EOL).
- `routePrefix` defaults to `/publishing` (not `/api/publishing`) — Payload prepends `/api` automatically. Documented in `building-plugins.md`.
- Tools take `AuditWriter` as a constructor dep instead of calling `getAuditWriter` inside the handler — same pattern as components.
- Rollback restores the version into draft and stops there; users explicitly call `publish` if they want it live. Lighter-weight than the spec's "validate-then-publish" approach but easier to reason about.
- Built-in `heading-hierarchy` check is structural (multiple Heroes flagged) rather than rendering-based. Full a11y rendering analysis is a Phase 2 service.

## C7 — Approvals Server

Spec: `docs/spec/C7-approvals-server.md`

Goal: Workflow + conversational approvals. Collection schema, MCP tools, HMAC action tokens, and the approval resolver the Publishing Server consumes.

- [x] `packages/approvals/` scaffolded with options surface (groups, GroupResolver, validateOptions resolving tokenSecret)
- [x] Approvals collection: target / request / decision / workflow-state field groups, indexes for the common queries, admin-only update + create-denied so only the plugin's tools mint records
- [x] HMAC action tokens (`generateActionToken`, `verifyActionToken`, `buildActionUrl`) using Web Crypto so the same code works in Node and edge runtimes; constant-time signature compare; configurable max-age (default 14 days)
- [x] Approval resolver auto-attached to Payload via `Symbol.for('@forumone/throughline/approvals-resolver')`; publishing's `approvalStep` reads it lazily so adding approvals to a config doesn't require re-wiring publishing's options
- [x] Five MCP tools (`request_approval`, `respond_to_approval`, `get_approval_status`, `list_pending_approvals`, `list_my_requests`) with audit emission tied to the right `approval.*` actions
- [x] Action endpoint at `/api/approvals/action` with confirmation-on-first-hit, single-use tokens via `consumedTokens`, `approval/decided` Inngest event, and audit emission
- [x] Self-approval blocked, group-membership check on respond, pending-status guard
- [x] Plugin uses `requireCapability('audit-log')` and fails at init when audit isn't registered
- [x] 49 unit tests covering options validation, token round-trip + tampering + expiry, resolver mapping, every MCP tool's happy/error paths, and every action-endpoint flow (missing token, invalid token, confirmation render, decision recorded, replay rejected, already-decided no-op)
- [x] Companion change in `@forumone/throughline-publishing`: `approvalStep` falls back to the symbol lookup. Patch bump.
- [x] Playground composes `approvalsPlugin` between componentsPlugin and publishingPlugin; build passes

Notes:

- Inngest pinned to `^4.0.0` (matches the rest of the framework; spec said `^3.0.0`).
- `routePrefix` defaults to `/approvals` (not `/api/approvals`) since Payload prepends `/api` automatically.
- First-decision-wins is a Phase 1 deliberate choice — multi-party approvals (legal AND comms both required) are deferred until a real client needs them.
- Action tokens are single-use and 14-day default lifetime. Replay protection is `consumedTokens` on the approval record.
- Group resolution is left to the consumer via `groupResolver.resolveUsers`; core doesn't hardcode membership lookup logic. Playground stubs it with `[]` until the playground gains a richer Users schema.
- Action endpoint HTML is intentionally minimal/unbranded — clients can register a custom-branded endpoint that calls into `verifyActionToken` if they want richer pages.

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

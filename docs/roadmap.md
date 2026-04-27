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
| [C8](#c8--audit-query-server) | Audit Query Server | ✅ Done |
| [C9](#c9--integrations-server) | Integrations Server | ✅ Done |
| [C10](#c10--workflows-package) | Workflows Package | ✅ Done |
| [C11](#c11--email-package) | Email Package | ✅ Done |
| [C12](#c12--forms-package) | Forms Package | ✅ Done |
| [C13](#c13--cli-scaffolder) | CLI Scaffolder | ✅ Done |
| [C14](#c14--documentation-site) | Documentation (markdown only; site deferred) | ✅ Done |

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

- [x] `packages/audit/` scaffolded with options surface (`collectionSlug`, `readAccess`) and `validateOptions` gate
- [x] Conversational formatting helpers (`formatRelativeTime`, `formatAuditEvent`) handling user/integration/system actor variants and dropping non-string optional fields cleanly under `exactOptionalPropertyTypes`
- [x] Five purpose-built MCP tools — `query_audit`, `get_change_history`, `who_changed_what`, `what_changed_in_range`, `get_recent_failures` — with bounded result sets, conservative defaults, and prose summaries Claude can relay directly
- [x] Tiered access control: admin/editor for broad-scope tools; `who_changed_what` always allows self-lookup so anyone can ask about their own changes without knowing their user ID
- [x] `auditQueryPlugin` (named to disambiguate from core's `auditPlugin`) registers the MCP handler, requires the `audit-log` capability, and fails fast if `auditPlugin` isn't installed first
- [x] 26 unit tests covering relative-time edge cases, formatter variants, every tool's filter shape, and access denial paths via a fake Payload that applies the `equals` / `greater_than_equal` / `less_than_equal` operators we use
- [x] Playground composes `auditQueryPlugin({})` after publishing; full root build/lint/typecheck/test green

Notes:

- `routePrefix` defaults to `/audit` (Payload prepends `/api`, so the endpoint is `/api/audit/mcp`).
- The plugin layers an admin/editor gate on top of the collection's own access control. The `readAccess` option sits on the collection in core; tool-level gating is hard-coded for now and can be unified once a client has a real role-model deviation.
- Tools take a `{ payload, collectionSlug }` deps object — same shape as the other server packages. Tools are cast through `unknown as McpToolDefinition[]` at the array level because each factory returns a narrowed `McpToolDefinition<typeof inputSchema>` for handler-input safety.

## C9 — Integrations Server

Spec: `docs/spec/C9-integrations-server.md`

Goal: Plugin architecture for connecting Payload to external systems. `Integration` interface, registry, per-instance config collection, MCP tools, and a generic outbound-webhook integration as the first concrete example.

- [x] `packages/integrations/` scaffolded with `Integration<Config>` contract (configFields, validateConfig, subscribes, createFunctions, mcpTools, healthcheck) and `IntegrationContext` (loadInstances, updateStatus, recordAudit) types
- [x] `IntegrationRegistry` — synchronous, per-plugin-init, rejects duplicate ids; covered by direct unit tests
- [x] Integrations collection with `name` / `integrationType` / `enabled` / `config` (json) / read-only `lastSyncAt` + `lastSyncStatus` + `lastError`; admin-only writes, admin/editor reads, indexes for the common queries
- [x] beforeChange hook runs the registered integration's `validateConfig` before write; rejects unknown types with the registered list in the error message
- [x] Webhook integration: HMAC-SHA256 via Web Crypto with RFC 4231 known-answer test vectors pinned to lock the wire format, configurable event filter, includeFullPayload toggle, timeoutSeconds, HEAD-based healthcheck (also accepts 405)
- [x] Webhook Inngest functions: `webhook-deliver` subscribes to all framework events, retries 5x, isolates failures via per-instance step.run; `webhook-manual-trigger` listens for `integration/manual-sync` from the trigger_sync tool
- [x] Five MCP tools (`list_integrations`, `get_integration_status`, `trigger_sync` admin-only, `test_integration`, `list_integration_types`) with conservative limits; every consequential call writes audit
- [x] Plugin requires `audit-log` capability; exposes registry+context via Symbols (`getIntegrationRegistry` / `getIntegrationContext`) so the client app's Inngest endpoint can serve integration functions
- [x] `docs/integrations-wiring.md` documents the Inngest-endpoint composition pattern with a copy-pasteable snippet
- [x] 36 unit tests covering registry, options, collection access + validation, HMAC vectors, payload extraction, webhook validateConfig, and every MCP tool's happy + access-denied paths via fake Payload + fake Inngest helpers
- [x] Playground composes `integrationsPlugin({ inngest })` after auditQueryPlugin; full root build/lint/typecheck/test green

Notes:

- Inngest 4.x's `createFunction` takes a single options object with a `triggers` array (the spec's three-arg form is from older Inngest releases).
- `trigger_sync` is admin-only because triggering an outbound POST is a write-side action even though it doesn't change configuration. Read tools (status, list, test) only need editor.
- Outbound headers are `x-throughline-event`, `x-throughline-signature`, `x-throughline-timestamp` (the spec used `x-claude-cms-*`). Receivers verify `sha256=<hex>` against the body using the shared signing secret.
- Plugin registers integrations into the registry but does not serve their Inngest functions; the client app composes them via `getIntegrationRegistry(payload)`. Documented as a Phase 1 wart in `docs/integrations-wiring.md`.

## C10 — Workflows Package

Spec: `docs/spec/C10-workflows.md`

Goal: Composable Inngest functions for common async work (revalidation on publish, scheduled publishes, stale-approval expiry, audit echo, healthchecks). Clients import what they want and merge into their Inngest endpoint.

- [x] `packages/workflows/` scaffolded as factories-only (no Payload plugin); next listed as an optional peer (`peerDependenciesMeta.next.optional = true`); ambient `next/cache` shim so the dynamic import typechecks under `module: NodeNext`
- [x] Shared types module covers every factory's options surface with built-in defaults, optional id overrides, and JSDoc on each option
- [x] `createRevalidateOnPublishFunction` subscribes to `content/page.{published,unpublished,rolled_back}` and revalidates page path / listings / sitemap; built-in URL builders for pages (home → /) and posts (/blog/:slug); `revalidate` option for non-Next.js frontends; default revalidator dynamic-imports `next/cache`
- [x] `createExecuteScheduledPublishesFunction` cron (default every 5 min) finds `_status: draft` docs past `scheduledPublishAt`, calls Publishing Server's MCP `publish` tool with Bearer auth (env fallback `PUBLISHING_SYSTEM_API_KEY`), counts published vs blocked vs error outcomes, never throws on policy rejections
- [x] `createExpireStaleApprovalsFunction` daily cron (2am UTC) flips pending approvals past expiresAt to `expired`, writes `approval.expired` audit via `getAuditWriter`, fires `approval/expired` Inngest event for downstream notifications; supports both string and `{ id }` requestedBy shapes
- [x] `createAuditEventEchoFunction` subscribes to `audit/event.recorded`, fires `notification/send-approval-{request,decision}` for the approval lifecycle, runs each handler in its own step.run so fan-out failures isolate
- [x] `createHealthcheckFunction` runs configurable checks isolated behind step.run, reports failures via `onFailure`, fires `system/healthcheck` heartbeat every tick; ships `createPayloadReachableCheck` and `createManifestReachableCheck` helpers
- [x] 28 unit tests via fake Inngest (captures createFunction definitions and `send` events) + fake Payload (applies `equals`/`less_than`/`less_than_equal`/`exists`); covers triggers, default schedules, custom URL builders, env-fallback API key, policy-rejection counting, audit fan-out, and healthcheck onFailure routing

Notes:

- No playground hookup: the playground doesn't ship an Inngest endpoint yet, so workflows are documented and tested but not exercised end-to-end here. A later phase will add the endpoint and wire factories into it.
- Inngest 4.x's `createFunction` takes a single options object with `triggers` (array) and `cron` triggers expressed as `{ cron }`. The spec used the older 3-arg form.
- `executeScheduledPublishes` deliberately does not retry on policy errors. Cron retries on a permanent error (e.g. composition failure) would log noise without making progress; the document stays at `_status: draft` until an admin intervenes.
- `audit-event-echo` is the single fan-out point. `email` (C11) subscribes to the `notification/send-approval-*` events fired here.

## C11 — Email Package

Spec: `docs/spec/C11-email.md`

Goal: Resend wrapper, React Email base layout with brand tokens, transactional templates (approval request / decision / expired), and Inngest functions subscribing to C10's audit-echo events.

- [x] `packages/email/` scaffolded against `react.json` tsconfig (JSX) with neutral default `EmailBrandTokens` (black on white, system sans, "Your Site"), `mergeTokens` helper, and tokens.ts JSDoc explaining why brandName lands in three places (header, From, footer)
- [x] `validateOptions` enforces inngest + RESEND_API_KEY/EMAIL_FROM_ADDRESS env fallback + resolver functions + buildActionUrl; surfaces missing config at boot rather than at first send
- [x] Resend client wrapper with lazy imports of both `resend` and `@react-email/render` so tests run with neither installed; per-call optional `replyTo` plus a `defaultReplyTo`
- [x] EmailLayout shared chrome (brand-name header, dividers, footer disclaimer); sticks to React Email primitives (`Body`, `Container`, `Section`, `Hr`, `Button`) to keep Outlook / Gmail / Apple Mail consistent
- [x] ApprovalRequestEmail with optional Why section, Preview CTA, three-action row (Approve / Request changes / Discuss), and an expiration footer line — buttons laid out in a nested HTML table because flexbox is unreliable in Outlook
- [x] ApprovalDecisionEmail with three variants (granted / declined / changes-requested), color-coded headlines, optional decision-notes callout, decision-aware "Next step" prose, and a Preview button shown on granted/changes-requested but hidden on declined
- [x] ApprovalExpiredEmail (intentionally plain — name, date, "ask Claude to request approval again")
- [x] Three Inngest notification functions: `notify-approval-request` (subscribes to `notification/send-approval-request`, sends one email per approver in `notifiedApprovers` with each in its own `step.run` so bounces retry without re-sending), `notify-approval-decision` (subscribes to `notification/send-approval-decision`, maps audit action → variant, emails the requester), `notify-approval-expired` (subscribes to `approval/expired`, notifies the requester)
- [x] `emailPlugin` exposes the email client and the three functions on the Payload instance via Symbols; `getEmailClient` and `getEmailFunctions` helpers let the client app's Inngest endpoint compose them in `serve()`
- [x] Templates render to both HTML and plaintext from the same React tree on every send (accessibility, deliverability, HTML-refusing clients)
- [x] 61 unit tests across tokens, options validation (env fallbacks + missing-config errors), Resend wrapper (mocked), each template (HTML + plaintext + show/hide behaviour + custom token theming), shared helpers, and each notification function (subscribe trigger, recipient routing, per-approver step.run isolation, error envelopes)

Notes:

- Inngest 4.x's `createFunction` takes one options object with a `triggers` array. Spec used the older 3-arg form.
- `react.json` tsconfig (jsx: react-jsx) is required for the .tsx templates; library tsconfig isn't enough.
- Templates expose `<!-- -->` comment markers between adjacent text + expression children (a React renderer artifact). Tests assert on identity-bearing fragments (names, titles, URLs) rather than verbatim sentences so renderer changes don't break them.
- Brand-name centralization is deliberate: From display name falls back through `EMAIL_FROM_NAME` → `tokens.brandName` → `'Your Site'`. Same brand string the layout shows in the header.
- No playground hookup: the playground doesn't ship an Inngest endpoint yet; the email plugin needs that to fire. Documented as a follow-up phase.

## C12 — Forms Package

Spec: `docs/spec/C12-forms.md`

Goal: Policy-aware forms. Wraps Payload's Form Builder with privacy notices, a11y, spam protection, destination allowlist, submitter confirmation. MCP tools for conversational create/update/query. Public submission endpoint + Inngest fan-out.

- [x] `packages/forms/` scaffolded against `react.json` tsconfig (JSX) with options validation: required Inngest, ≥1 unique-labeled allowedDestinations with per-type value checks (email contains `@`, webhook is `https://`), `>=32`-char ipHashSecret with `FORMS_IP_HASH_SECRET` env fallback. Resolved-config object centralizes defaults so the rest of the package consumes one shape.
- [x] Allowlist enforced at three layers — MCP tool, Forms collection's beforeChange hook (covers admin / direct-API writes), and the fan-out worker (drops + warns on labels removed by a redeploy)
- [x] addFormPolicyFields appends a single `policy` group (privacy notice, consent toggle + label, spam protection [honeypot + per-form rate limit], destinations array with allowlist-bound select, submitter-confirmation block); does not mutate the input
- [x] Public submit endpoint registered via Form Builder's `formOverrides` slot at `<routePrefix>/submit`; pipeline: honeypot (silent 200 if filled, so bots don't pivot) → form lookup (404 if missing) → consent (server-side; client bypass doesn't work) → rate limit (Postgres-counted per (form, ipHash) per hour, with per-form override) → persist sanitized [{field, value}] rows → fire `form/submission.received`
- [x] IP hashing via HMAC-SHA256 / Web Crypto with the per-deployment secret so cross-deployment hash tables can't be joined; `extractClientIp` honors x-forwarded-for / x-real-ip / cf-connecting-ip with a 0.0.0.0 fallback
- [x] Six MCP tools: `list_allowed_destinations` (omits raw values), `validate_form` (dry run), `create_form` (admin/editor; allowlist + accessibility + submitter-confirmation pointer; audits via `form.created`), `update_form_fields` (refuses to remove fields the existing submitterConfirmation references), `update_form_destinations` (replace-all semantics; rejects unknown / duplicate labels), `get_form_submissions` (defaults to redacted output; `includePii=true` requires admin or form-admin)
- [x] Adds `form.updated` to the AUDIT_ACTIONS taxonomy in core (used by both update tools); patch bump on `@forumone/throughline-core`
- [x] FormSubmissionEmail (admin notification with labeled field list and optional admin link) + SubmitterConfirmationEmail (auto-reply with paragraph splitting) — render to HTML and plaintext from the same React tree
- [x] Four Inngest functions exposed via `getFormsFunctions(payload)` for the client app's Inngest endpoint to compose: `form-fan-out` (per-destination dispatch + optional submitter-confirmation), `form-email-destination` (lazy email-client lookup; throws on missing client so Inngest retries), `form-webhook-destination` (HMAC-signed POST with retry-on-non-2xx), `form-submitter-confirmation` (skip+log on misconfiguration so one bad form doesn't poison the queue)
- [x] `formsPlugin` requires `audit-log` + `email` capabilities; refuses to init without them
- [x] 86 unit tests across options, destinations, policy fields, honeypot, IP hashing, rate limiting, the submit endpoint, the six MCP tools, the four Inngest functions, and the two templates (HTML + plaintext)

Notes:

- @payloadcms/plugin-form-builder peers are version-locked to payload (3.83.0 plugin needs 3.83.0 payload), not caret-compatible. The package.json pins the exact form-builder version.
- Inngest 4.x's `createFunction` shape (single options object with `triggers`) is used throughout. Spec used the older 3-arg form.
- `next` and Inngest endpoint serving are the consumer's responsibility; `getFormsFunctions(payload)` returns the four functions and the README documents the wire-up.
- No playground hookup: playground doesn't ship an Inngest endpoint and doesn't have `formBuilderPlugin` wired. The forms package is documented and tested but not exercised end-to-end here. Same Phase 2 follow-up as workflows + email.

## C13 — CLI Scaffolder

Spec: `docs/spec/C13-cli.md`

Goal: `create-throughline` CLI. `pnpm create @forumone/throughline my-client-site` → ready-to-run monorepo, env stubs, example collection + DS reference, first-deployment checklist.

- [x] `@forumone/create-throughline` published to npm (`pnpm create @forumone/throughline <name>`)
- [x] Seven-question interactive flow via `@clack/prompts`; project name + npm scope validated
- [x] Generator with `{{var}}` + `{{#if}}/{{else}}` template renderer; `.template` suffix stripped on write
- [x] `templates/base/` produces a working pnpm monorepo with Next.js 16 + Payload 3.83
- [x] `templates/with-reference-ds/` overlay re-exports the reference DS + manifest
- [x] `templates/without-reference-ds/` overlay produces a placeholder + README
- [x] Generated `payload.config.ts` wires all eight Throughline plugins in the right order with `TODO` markers for client-specific resolvers
- [x] Generated `apps/web/src/app/api/inngest/route.ts` registers every framework function (revalidate, scheduled-publish, expire-approvals, audit-echo, healthcheck, email, forms, integrations)
- [x] Generated `.env.example` lists every required secret with comments
- [x] Post-install printer adapts to deployment + database choices and the reference-DS choice
- [x] 36 unit tests (renderer, prompts validators, generator end-to-end)

## C14 — Documentation

Spec: `docs/spec/C14-docs.md` (live site deferred; markdown-in-repo only)

Goal: Documentation that makes the framework usable by someone who didn't build it — architecture, getting started, per-package API reference, customization guides, DS-contract authoring guide.

The original spec called for a Nextra-based docs site. We're shipping the *content* now (under `docs/`) and deferring the live-site publishing flow to a later phase.

- [x] Top-level `docs/README.md` Diátaxis-style index
- [x] Getting-started tutorials (4 pages): scaffolding, first Claude connection, first publish, deploying to Vercel
- [x] Concepts (6 pages): architecture overview, plugin composition, the trust boundary, design system contracts, event-driven workflows, client-agnostic core
- [x] How-to guides (9 pages): adding a collection, authoring contracts, theming emails, adding an integration, configuring approvers, customizing accessibility checks, migrating content, upgrading, building a plugin
- [x] Operations (5 pages): deployment options, env vars, observability, security model, Phase 2 expansions
- [x] Reference (13 pages): one per published package, plus an index
- [ ] Live docs site (Nextra + Vercel deployment) — deferred to a future phase
- [ ] Auto-generated typedoc reference replacing the hand-authored reference pages — deferred

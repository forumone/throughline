# @forumone/create-throughline

## 0.4.0

### Minor Changes

- 8b7d698: A scaffolded project ships a two-tier CI workflow:

  - `fast` runs on every pull request with no database. It installs from the lockfile, then runs typecheck, lint, the workspace and migration gates, manifest validation, a generated-files check and tests, with a non-blocking audit.
  - `verify` runs on pushes to main. It migrates a fresh Postgres and runs a production build.

  `check-generated.sh` regenerates `payload-types.ts` and the admin import map and fails on any difference, including an uncommitted file. `apps/web` gains `generate:types` and `generate:importmap`.

- 8b7d698: A scaffolded project manages its schema through migrations from the first table on:

  - **Config.** `payload.config.ts` sets `push: false` and an explicit `migrationDir`. It connects through a resolver that knows the Vercel–Neon integration's variables, keeps a migration off Neon's pooled endpoint, and accepts an optional migration-only credential.
  - **Scripts.** `apps/web` gains `migrate`, `migrate:create`, `migrate:status`, `migrate:snapshot` and `check:migrations`. The check asserts that every migration has its schema snapshot, that no snapshot is orphaned, and that no drop follows a `CASCADE` that has already carried it out.
  - **Write guard.** `scripts/lib/target.ts` gives scripts that write to a database a `requireTarget` guard.

- 8b7d698: A scaffolded project ships three workspace gates as root scripts:

  - `check:instances`: `payload`, `@payloadcms/ui`, `react` and `react-dom` each resolve to exactly one copy
  - `check:tested`: every package that ships code has at least one test
  - `check:audit`: production advisories are checked against an allowlist that carries a reason for each entry and fails when an entry goes stale

### Patch Changes

- e9077b3: The reference design system's manifest build and validation, which every scaffolded project vendors, now:

  - refuse a component directory with no contract, instead of silently leaving it out of the manifest
  - read the directories that hold components from a `CONTRACT_LAYERS` list
  - name the manifest from the project's own `package.json`, instead of claiming to be `@forumone/throughline-reference-ds`
  - treat `antiExamples.empty` and `intent.brevity` as errors

- 6800052: The scaffold compiles against the current Throughline releases, and serves its tools over MCP:

  - `payload.config.ts` no longer imports `createApiKeysCollection`, which core removed.
  - One `createMcpToolCollector()` is passed to every tool-bearing plugin, and `@payloadcms/plugin-mcp` is registered after them, with its key collection narrowed to admins.
  - The Inngest route types the integration registry, so `serve()` can type its function list.
  - `@payloadcms/plugin-form-builder` is a caret range like the rest of `@payloadcms/*`, so it no longer installs a second `@payloadcms/ui`.
  - `.env.example` and the printed next steps drop the per-server MCP keys that no longer exist.

## 0.3.1

### Patch Changes

- eec328e: A scaffolded site depends on the current release of every Throughline package. The ranges were typed into the templates as `^0.2.0`, which admits patches only for a 0.x version, so a new site installed the earliest releases. They are now read from the workspace when the scaffolder is built, and baked into `dist/versions.json`.
- 70223ef: The scaffolded `payload.config.ts` signs approval links with `generateActionToken` and points them at `/api/approvals/action`, the route `approvalsPlugin` serves. It used to build an unsigned query string against `/api/approvals/decision`, which nothing serves, so every button in an approval email 404'd.

## 0.3.0

### Minor Changes

- e994176: Scaffold a real Storybook authoring environment for the design system.

  When you scaffold with the reference design system, the generator now creates a top-level `design-system/` workspace (a sibling of `apps/`, matching the Forum One `forumone.com-2026` layout) that vendors the reference DS's **editable source** — 12 components with `.stories.tsx`, `.contract.ts`, tokens, and a Storybook instance — instead of re-exporting the compiled npm package. New projects can run `pnpm storybook` immediately, author components, and `pnpm validate` to cross-check every contract `storyId` against the built Storybook.

  Also:
  - The web app now imports the workspace design system's built manifest (`<scope>/design-system/manifest`) instead of the npm reference-ds manifest, and the root `pnpm dev` builds the design system first so the manifest exists.
  - Root scripts `storybook`, `build-storybook`, and `validate`; turbo tasks to match; `design-system` added to the workspace globs.
  - Fix: template `.gitignore` files are now authored as `gitignore` and restored on output, so they survive npm publish (previously the generated project shipped without a root `.gitignore`).
  - Fix: the generated web app now typechecks clean. Adds the `@payload-config` tsconfig path; corrects drifted plugin APIs in `route.ts` (`publishingApiKey`, `createPayloadReachableCheck()`) and `payload.config.ts` (`auditQueryPlugin({})`, `buildActionUrl` async `{ approvalId, action, approverId }`, manifest typed as `Manifest`).

## 0.2.1

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

## 0.2.0

### Minor Changes

- 2dac330: Initial release of `@forumone/create-throughline`. Interactive CLI that scaffolds a new Throughline project: pnpm monorepo with Payload CMS + all eight Throughline plugins wired (audit, components, publishing, approvals, audit-query, integrations, email, forms), an Inngest endpoint registering every framework function, an `.env.example` listing every required secret, and an optional reference-design-system overlay. Run with `pnpm create @forumone/throughline my-project`.

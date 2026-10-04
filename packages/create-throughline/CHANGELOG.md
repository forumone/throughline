# @forumone/create-throughline

## 1.9.1

## 1.9.0

## 1.8.0

## 1.7.0

## 1.6.0

## 1.5.0

## 1.4.0

## 1.3.0

## 1.2.0

## 1.1.0

### Patch Changes

- 0ecb757: A scaffolded project puts its env file where `next dev` reads it, and does not make every account an administrator. The instructions copy `.env.example` to `apps/web/.env.local` rather than the root, which `next dev` in `apps/web` never read. New users default to `editor`; the first account, made at `/admin/create-first-user`, is the admin; and only an admin may set a role or a group.

## 1.0.1

## 1.0.0

### Major Changes

- 1595db1: The scaffold builds a 1.0 site. It depends on `@forumone/throughline` and, with the reference design system, `@forumone/throughline-design-system`, rather than on the nine 0.x packages. `payload.config.ts` registers the suite with one `throughline()` call, and `app/api/inngest/route.ts` serves `suite.jobs`, with the one Inngest client in `lib/inngest.ts`. Forms is no longer scaffolded, nor is `FORMS_IP_HASH_SECRET` asked for. The template's stub approval resolver, which overrode the approvals plugin's own and so blocked every publish that required approval, is gone.

  From 1.0 the scaffolder is versioned with `@forumone/throughline` and `@forumone/throughline-design-system`: one version across the three.

## 1.0.0-next.2

### Major Changes

- 1595db1: The scaffold builds a 1.0 site. It depends on `@forumone/throughline` and, with the reference design system, `@forumone/throughline-design-system`, rather than on the nine 0.x packages. `payload.config.ts` registers the suite with one `throughline()` call, and `app/api/inngest/route.ts` serves `suite.jobs`, with the one Inngest client in `lib/inngest.ts`. Forms is no longer scaffolded, nor is `FORMS_IP_HASH_SECRET` asked for. The template's stub approval resolver, which overrode the approvals plugin's own and so blocked every publish that required approval, is gone.

  From 1.0 the scaffolder is versioned with `@forumone/throughline` and `@forumone/throughline-design-system`: one version across the three.

## 0.5.0

### Minor Changes

- 006ae30: A missing environment variable is reported together with every other one, in a
  single error, instead of one plugin at a time.

  The plugins that read the environment at init now declare what they cannot
  start without, as data: `approvalsEnv` (`APPROVAL_TOKEN_SECRET`, 32+
  characters), `emailEnv` (`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`) and `formsEnv`
  (`FORMS_IP_HASH_SECRET`, 32+ characters). Each is a list of `EnvRequirement`
  (`{ name, minLength?, why }`), a new type in `plugin-contract`, and each
  plugin's own init check now reads the same entries, so the two cannot drift.
  An empty or whitespace-only value now counts as missing in those checks.

  Core exports `assertEnvironment(...checks)`. Call it first in
  `payload.config.ts` with the plugins' lists and your own variables; it throws
  one `EnvironmentError` whose first line reads "Configuration problem: N
  environment variables are missing or invalid", followed by every missing or
  too-short variable and why it is needed. Values are never printed. An argument
  can also be a function, for a rule that is not "this name, this long", such as
  a database URL accepted under several names. `checkEnvValue` is the one-value
  check behind it, for a plugin's own backstop.

  New projects call `assertEnvironment` at the top of `payload.config.ts` with
  `approvalsEnv`, `emailEnv`, `formsEnv`, `PAYLOAD_SECRET` (32+ characters),
  `NEXT_PUBLIC_SERVER_URL` and the database resolver, and `.env.example` marks
  which variables are checked. An existing site can do the same and delete any
  hand-kept copy of the plugins' requirements.

- 833c1bd: A scaffolded project ships the rules an agent, or a new developer, needs:

  - **`CLAUDE.md`** covers the layout, the gate in CI's own order, which files are generated and committed, how migrations and snapshots work, and the contract rule for the design system.
  - **A Stop hook** (`.claude/hooks/gate.sh`) runs typecheck and lint when a session ends with pending changes. It reports, never blocks, and is silenced by `THROUGHLINE_SKIP_GATE=1`.

  The README's project layout now matches what the scaffold generates.

- 549d292: A scaffolded project runs every Payload CLI script — `payload`, `generate:types`, `generate:importmap`, `migrate`, `migrate:create`, `migrate:status` — through core's `throughline-payload`, so a hung run is killed rather than left spinning after its shell dies. It adds `payload:reap` to `apps/web` and the root, and ignores `.payload-cli-pids`.
- 70385c4: A scaffolded project reports its failures. `apps/web/src/instrumentation.ts` sends unhandled request errors to `ERROR_WEBHOOK_URL` through core's reporter, and warns at boot when that variable is unset. The Inngest route passes `createTerminalFailureHandler` to every framework workflow and `createHealthcheckFailureHandler` to the healthcheck. `payload.config.ts` registers `jobFailuresPlugin`. `.env.example` lists `ERROR_WEBHOOK_URL` as optional.

  A new project's first migration includes the `job-failures` table. An existing project that copies these changes needs `payload migrate:create`.

- c8a86bf: A scaffolded project now starts with tests in `apps/web`:

  - **Vitest.** `vitest.config.ts` loads `payload.config.ts` with placeholder variables and no database. `src/access/anonymousAccess.test.ts` uses `describeAnonymousAccess` to put every collection the project has into an access bucket. `pnpm test` runs it in CI's `fast` job. `check:tested` drops its exception for `apps/web`.
  - **Playwright smoke pack.** `e2e/` runs against `next start`, or against `E2E_BASE_URL`. It checks the front door, a 404, the admin sign-in screen, and anonymous REST reads. The paths are in `e2e/site.ts`, along with the checks a new project cannot pass yet because it does not serve the routes they test. It runs in CI's `verify` job after the build. The new scripts are `test`, `test:smoke` and `test:smoke:install`.
  - **`pages` read rule.** The example `pages` collection gains a published-or-signed-in `read` rule. Before, Payload's default refused every anonymous read, so the public site could never read a page.

### Patch Changes

- c8a86bf: The `Divider` contract now declares `decorative` with `defaultValue: true`, matching the component. Before, the default was written only in prose, so a divider added in the CMS started unticked and screen readers announced it.
- ab623e1: The scaffolded `payload.config.ts` uses core's `mcpApiKeyAccess(isAdmin)` to make the MCP key collection admin-only, replacing the inline override. It now also covers `unlock` and refuses a key principal outright. The scaffold depends on `payload` and `@payloadcms/*` `^3.89.0`.
- 653817e: Revalidation no longer guesses paths, and covers the changes a publish event never announces.

  - **workflows (breaking)**: `createRevalidateOnPublishFunction` has no built-in URL
    builders. They mapped `pages` to `/<slug>`, `posts` to `/blog/<slug>` and any other
    collection to `/<slug>`, so a site whose routes differed revalidated the wrong path
    without a word. `urlBuilders` is now required; a collection with no entry has its
    tags dropped and no path revalidated, and the run logs a warning. To keep the old
    behaviour, pass the old builders:

    ```ts
    urlBuilders: {
      pages: (slug) => (slug === 'home' || slug === '' ? '/' : `/${slug}`),
      posts: (slug) => `/blog/${slug}`,
    }
    ```

    and then check them against your routes.

  - **workflows**: `createTagRevalidationHooks` — collection `afterChange` and
    `afterDelete`, and global `afterChange`, hooks that call
    `revalidateTag(tag, { expire: 0 })`. Draft saves and autosave drop nothing (via
    publishing's `isDraftWrite`); an unpublish still does. A hook never throws: outside a
    Next request (seeds, migrations, the CLI) it logs at `debug`, and any other failure
    at `error` with the tag and the cause.
  - **workflows**: `createCacheTags` builds every tag string, so the hooks, the publish
    workflow (new `cacheTags` option) and cached reads cannot name different tags.
    Defaults: the bare slug for a collection, `global_<slug>` for a global. Also on the
    dependency-free `@forumone/throughline-workflows/cache-tags` subpath for frontend code.
    `@forumone/throughline-publishing` is now a dependency of this package.
  - **create-throughline**: the scaffold adds `apps/web/src/lib/cache-tags.ts`, attaches
    the tag hooks to `Pages`, and passes explicit `urlBuilders` and the shared
    `cacheTags` to the publish workflow.

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

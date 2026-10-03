# @forumone/create-throughline

Interactive scaffolder for new Throughline projects. Run with `pnpm create @forumone/throughline <project-name>` to produce a pnpm monorepo with Payload, the Throughline suite registered by `throughline()`, an Inngest endpoint, CI, and an `.env.example`.

## Usage

```bash
pnpm create @forumone/throughline my-site
```

Or via npm:

```bash
npm create @forumone/throughline@latest my-site
```

The CLI asks seven questions:

| # | Question | Default |
| --- | --- | --- |
| 1 | Project name | matches your directory name |
| 2 | npm scope (without `@`) | blank |
| 3 | Use the reference design system? | yes |
| 4 | Deployment platform | vercel |
| 5 | Postgres provider | neon |
| 6 | Initialize git? | yes |
| 7 | Install dependencies? | yes |

See [Scaffolding a project](../getting-started/scaffolding-a-project.md) for the full walkthrough.

## What it generates

```
my-site/
├── apps/
│   └── web/                                     # Next.js 16 + Payload 3
│       ├── src/
│       │   ├── payload.config.ts                # assertEnvironment, then throughline(), with TODOs
│       │   ├── lib/inngest.ts                   # the Inngest client and jobs adapter
│       │   ├── app/
│       │   │   ├── (frontend)/                  # placeholder home page
│       │   │   ├── (payload)/                   # admin + REST routes
│       │   │   └── api/
│       │   │       └── inngest/route.ts         # serves suite.jobs
│       │   ├── access/anonymousAccess.test.ts   # every collection in an access bucket
│       │   └── instrumentation.ts               # error reports to ERROR_WEBHOOK_URL
│       ├── e2e/                                 # Playwright smoke pack; routes in e2e/site.ts
│       ├── playwright.config.ts                 # next start locally, or E2E_BASE_URL
│       ├── vitest.config.ts                     # loads payload.config.ts with no database
│       └── ...
├── design-system/                               # the reference design system, or a placeholder
├── .github/workflows/ci.yml                     # fast and verify tiers
├── .env.example                                 # every variable; required ones checked at startup
├── CLAUDE.md
├── pnpm-workspace.yaml
├── turbo.json
└── README.md                                    # setup instructions
```

`apps/web` depends on `@forumone/throughline`, and on `@forumone/throughline-design-system` when the reference design system is chosen. Its `payload` script runs the Payload CLI through `throughline-payload`.

### The reference design system

Answering yes to question 3 writes a brand-neutral design system into `design-system/`: twelve components, each with a contract, a CSS-variable token layer, a generated manifest and Storybook. It is source the project owns from then on, not a dependency.

Its upstream copy is private, at `packages/create-throughline/reference-ds`, and is also `@forumone/throughline/components`' test fixture. `pnpm --filter @forumone/create-throughline sync-reference-ds` vendors it into the template, and CI fails when the two drift. Its last published version, `@forumone/throughline-reference-ds@0.3.7`, stays on npm.

### Tests a scaffolded project starts with

- `apps/web/src/access/anonymousAccess.test.ts` calls `describeAnonymousAccess` from `@forumone/throughline/testing`. It holds every collection in the config, including the ones plugins add, to a bucket: either `renderPath` (read anonymously by the site) or `private`. The scaffold's `pages` collection has a published-or-signed-in `read` rule for this reason. `pnpm test` runs it in CI's `fast` job, and `check:tested` has no exception for `apps/web`.
- `apps/web/e2e` is a Playwright smoke pack. It checks the front door, a 404, the admin sign-in screen, and anonymous REST reads. It runs in `verify` after the build, against the database that job migrates. Checks for routes a new project does not serve are listed in `e2e/site.ts` as work to do when the route exists: security headers, `robots.txt`, the sitemap, `llms.txt` and draft mode.
- There are no block tests, because the scaffold generates no Payload blocks. A project that adds them has `describeBlockInvariants` and `check-block-props` in [`@forumone/throughline-design-system`](design-system/generate.md#testing-a-sites-blocks).

Upstream, the `Scaffold` CI job generates a project from the packed packages and runs its gates, its migration, `next build` and the smoke pack against Postgres, so a template that no longer builds fails the pull request that broke it.

## Public API

The CLI is primarily an interactive binary, but its internal modules are exported for testing and programmatic use:

```typescript
import {
  gatherAnswers,
  generate,
  renderTemplate,
  printNextSteps,
  validateProjectName,
} from '@forumone/create-throughline'

import type {
  Answers,
  GenerateOptions,
} from '@forumone/create-throughline'
```

### `Answers`

```typescript
interface Answers {
  targetDir: string                            // absolute
  projectName: string
  packageScope: string                         // empty string = no scope
  useReferenceDs: boolean
  initializeGit: boolean
  installDeps: boolean
  deploymentPlatform: 'vercel' | 'railway' | 'fly' | 'other'
  databasePlatform: 'neon' | 'supabase' | 'self-hosted-postgres'
}
```

### `gatherAnswers({ targetDir })`

Drives the `@clack/prompts` flow. Validates inputs, exits early if `targetDir` already exists.

### `generate(answers, options)`

Generates the project at `answers.targetDir`. Always:

- Creates the directory and copies `templates/base/` with `{{var}}` and `{{#if}}` substitution applied
- Layers either `templates/with-reference-ds/` or `templates/without-reference-ds/`

If `options.skipSideEffects` is false (the default in production):

- Optionally runs `git init` + initial commit
- Optionally runs `pnpm install`

Tests pass `skipSideEffects: true`.

### `renderTemplate(template, data)`

Minimal mustache-style renderer:

```typescript
renderTemplate('hi {{name}}', { name: 'Ada' })             // 'hi Ada'
renderTemplate('{{#if ok}}A{{else}}B{{/if}}', { ok: true }) // 'A'
```

Supports `{{variable}}`, `{{#if variable}}`, `{{else}}`, `{{/if}}`. No nesting, no helpers, no escapes. Variables inside if blocks expand correctly via two-pass replacement (if-blocks first, then variables).

### `validateProjectName(value)`

Returns an error string if invalid, `undefined` if OK. Used by the prompts and exposed for clients that drive the CLI programmatically.

## Templates

Templates live in `src/templates/` (and ship as `dist/templates/` after build). Three roots:

- `base/` — files every project gets
- `with-reference-ds/` — overlay applied when `useReferenceDs: true`: the vendored reference design system
- `without-reference-ds/` — overlay applied when `useReferenceDs: false`

Files with the `.template` suffix have it stripped after rendering. This lets us author template TS files like `payload.config.ts.template` without TypeScript treating them as broken syntax during development.

## Programmatic invocation

Useful for tests and integration scripts:

```typescript
import { generate } from '@forumone/create-throughline'

await generate(
  {
    targetDir: '/tmp/test-project',
    projectName: 'test',
    packageScope: 'acme',
    useReferenceDs: true,
    initializeGit: false,
    installDeps: false,
    deploymentPlatform: 'vercel',
    databasePlatform: 'neon',
  },
  { skipSideEffects: true },
)
```

## Versioning

The scaffolder writes a caret range of the version it was published with, read from the packages rather than typed into the templates, so a new project starts on the release that matches its templates and picks up minors from there. A major is a deliberate `pnpm update --latest`. See [Upgrading core packages](../guides/upgrading-core-packages.md).

All three 1.0 packages release at one version.

## Related

- Tutorial: [Scaffolding a project](../getting-started/scaffolding-a-project.md)
- Concept: [Client-agnostic core](../concepts/client-agnostic-core.md)

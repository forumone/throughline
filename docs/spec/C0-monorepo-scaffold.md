# Phase C0 — Monorepo Scaffold

## Goal

Create the `@forumone/claude-cms` monorepo with Turborepo, pnpm workspaces, changesets for versioning, shared tooling (TypeScript, ESLint, Prettier), and CI that builds every package, runs tests, and publishes to npm on tagged releases. This is the foundation every other core phase assumes.

## Prerequisites

Before starting, the developer (not Claude Code) needs:

- An npm account with publish access to the `@forumone` scope
- A GitHub organization or account for hosting the repo
- Node.js 20.9+ and pnpm 9+ installed locally
- Access to create secrets in the GitHub repo (for the npm publish token)

## Context

This phase is pure tooling. Nothing interesting runs at the end of it — no MCP server, no Payload, no website. But getting the tooling right here saves compounding pain later. Every future phase assumes the monorepo is set up correctly. Breaking changes to the tooling after other packages exist is painful; establishing conventions up front is cheap.

A few deliberate choices worth calling out:

**Turborepo + pnpm workspaces** for build orchestration and dependency management. Turborepo handles task graph caching and parallelization; pnpm workspaces handle local package linking. They work together cleanly.

**Changesets** for versioning and publishing. Each PR that changes a package adds a changeset file describing the change type (patch, minor, major). Changesets aggregates these into a release PR that bumps versions, updates changelogs, and publishes on merge. This is standard for npm monorepos and worth the slight learning curve.

**Shared configs as packages.** TypeScript base configs, ESLint configs, and Prettier configs are internal packages (`@forumone/claude-cms-tsconfig`, etc.) that other packages extend. This is how you get consistency without duplication.

**Strict TypeScript.** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. The core framework is going to be consumed by many downstream projects; type quality matters more than developer convenience.

## Tasks

### C0.1 — Initialize the repo

Create a new GitHub repo named `claude-cms` in the Forum One organization. Clone locally.

Initialize:

```bash
pnpm init
```

Set up `package.json` at the root:

```json
{
  "name": "@forumone/claude-cms",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "changeset": "changeset",
    "version": "changeset version",
    "publish-packages": "turbo run build && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "turbo": "^2.3.0",
    "typescript": "^5.6.0",
    "prettier": "^3.4.0"
  },
  "packageManager": "pnpm@9.14.0",
  "engines": {
    "node": ">=20.9.0",
    "pnpm": ">=9.0.0"
  }
}
```

### C0.2 — Set up pnpm workspaces

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

Create the directory structure:

```bash
mkdir -p packages apps
```

Add `.gitignore` with standard Node exclusions plus Turborepo:

```
node_modules
.turbo
dist
build
.next
*.log
.DS_Store
.env
.env.local
.env.*.local
coverage
.vercel
```

Add `.npmrc`:

```
auto-install-peers=true
strict-peer-dependencies=false
```

### C0.3 — Set up Turborepo

Create `turbo.json` at the root:

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"],
      "env": ["NODE_ENV"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

This defines the task graph. `build` depends on dependencies' builds finishing first, which ensures packages build in the right order.

### C0.4 — Create shared config packages

Three internal-only config packages that other packages extend. These are private (`"private": true`, never published to npm).

**`packages/tsconfig/package.json`:**

```json
{
  "name": "@forumone/claude-cms-tsconfig",
  "version": "0.0.0",
  "private": true,
  "files": ["base.json", "library.json", "nextjs.json", "react.json"]
}
```

**`packages/tsconfig/base.json`:**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**`packages/tsconfig/library.json`** — for published library packages:

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  }
}
```

**`packages/tsconfig/nextjs.json`** — for Next.js apps (docs site, playground):

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "ES2022"],
    "jsx": "preserve",
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "plugins": [{ "name": "next" }]
  },
  "exclude": ["node_modules"]
}
```

**`packages/tsconfig/react.json`** — for React library packages (reference DS):

```json
{
  "extends": "./library.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "ES2022"],
    "jsx": "react-jsx"
  }
}
```

Create `packages/eslint-config/` and `packages/prettier-config/` similarly. Use sensible defaults; Claude Code can use the current community standards for ESLint flat config and Prettier. Key rules for ESLint:

- `@typescript-eslint/no-unused-vars` as error
- `@typescript-eslint/consistent-type-imports` as error
- `import/no-default-export` as warning (except for Next.js pages, Storybook stories, Payload config)
- `no-console` as warning (errors may use console; libraries should use a proper logger)

### C0.5 — Set up changesets

Initialize:

```bash
pnpm changeset init
```

Edit `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "forumone/claude-cms" }],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@forumone/claude-cms-tsconfig", "@forumone/claude-cms-eslint-config", "@forumone/claude-cms-prettier-config"]
}
```

Install the GitHub changelog plugin:

```bash
pnpm add -D -w @changesets/changelog-github
```

The `ignore` array excludes internal config packages from changesets — they never publish.

Add a changeset template or a CONTRIBUTING.md snippet explaining how to author changesets:

> When you make a change to any public package, run `pnpm changeset` and follow the prompts. Select the packages you changed, choose patch/minor/major for each, and write a one-line summary. This creates a `.changeset/*.md` file you commit alongside your change. Changesets aggregates these into release PRs.

### C0.6 — Set up CI

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Setup Turborepo cache
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ github.sha }}
          restore-keys: turbo-

      - name: Build
        run: pnpm build

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test
```

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: release

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: "https://registry.npmjs.org"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm publish-packages
          commit: "chore: release"
          title: "chore: release packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
```

In GitHub repo settings, add secrets:

- `NPM_TOKEN` — a granular access token from npm with publish access to `@forumone` scope
- Settings → Actions → General → Workflow permissions → "Read and write permissions" + "Allow GitHub Actions to create and approve pull requests"

### C0.7 — Set up Prettier and EditorConfig

Create `.prettierrc.json` at the root:

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

Create `.prettierignore`:

```
dist
build
.next
.turbo
node_modules
pnpm-lock.yaml
CHANGELOG.md
```

Create `.editorconfig`:

```
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

### C0.8 — Scaffold a smoke-test package

To verify the whole pipeline works end-to-end, create one trivial package that gets built, tested, and would (in principle) be published.

`packages/smoke-test/package.json`:

```json
{
  "name": "@forumone/claude-cms-smoke-test",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b -w",
    "clean": "rm -rf dist .turbo",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-eslint-config": "workspace:*",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/smoke-test/tsconfig.json`:

```json
{
  "extends": "@forumone/claude-cms-tsconfig/library.json",
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

`packages/smoke-test/src/index.ts`:

```typescript
export function hello(name: string): string {
  return `Hello, ${name}`
}
```

`packages/smoke-test/src/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { hello } from './index'

describe('hello', () => {
  it('greets by name', () => {
    expect(hello('world')).toBe('Hello, world')
  })
})
```

After adding this, run `pnpm install`, then `pnpm build`, then `pnpm test`. All three should succeed. Commit.

Create a changeset for it: `pnpm changeset` → select `@forumone/claude-cms-smoke-test` → patch → message "Initial smoke test package." Commit the changeset.

### C0.9 — Verify the release pipeline (dry run)

Push to a feature branch, open a PR against main. Verify CI passes. Merge.

On merge to main, the release workflow should either:

- Open a "Version Packages" PR if there are unreleased changesets, OR
- Publish packages if the "Version Packages" PR was just merged

To dry-run the publish path: merge the release PR that changesets opens. It should bump `@forumone/claude-cms-smoke-test` to 0.0.2 (or whatever the changeset specified) and publish to npm.

Verify on npm that `@forumone/claude-cms-smoke-test@0.0.2` exists. You can now `npm install @forumone/claude-cms-smoke-test` from anywhere.

Once verified, delete the smoke-test package. Create a changeset noting the removal. Merge the next release PR. The package stays on npm forever (npm deprecates rather than deletes), but it's gone from the repo and no future version publishes.

Alternatively: skip 8 and 9 and trust that the pipeline works. The smoke-test walk-through is valuable for first-time setup but can be skipped if you're confident.

### C0.10 — Add project documentation

Create `README.md` at the root:

```markdown
# @forumone/claude-cms

A conversational content management framework. Exposes Payload CMS as a set of MCP servers so marketers can operate websites through Claude rather than a traditional admin UI.

## Status

Pre-1.0. APIs will change. Track progress in `docs/roadmap.md`.

## Packages

See `packages/` for the published packages. Each has its own README.

## Using in a client project

Scaffold a new client project with the CLI:

```bash
pnpm create @forumone/claude-cms my-client-site
```

See the [getting started guide](./docs/getting-started.md) for a full walkthrough.

## Development

Clone the repo, install dependencies, build everything:

```bash
pnpm install
pnpm build
```

Author changes, add a changeset:

```bash
pnpm changeset
```

Open a PR. CI runs build, typecheck, lint, and test. On merge to main, Changesets opens a release PR that publishes to npm on merge.
```

Add `CONTRIBUTING.md` with guidance on branching, changesets, commit messages, code review expectations.

Add `LICENSE` — pick the appropriate license for Forum One's policy (MIT is conventional for framework packages; Apache 2.0 is sometimes preferred for commercial work).

### C0.11 — Set up branch protection

In GitHub repo settings → Branches → Add rule for `main`:

- Require pull request before merging
- Require status checks to pass: CI workflow
- Require branches to be up to date before merging
- Require linear history (optional but keeps the changelog clean)

This prevents direct pushes to main and ensures every change goes through review and CI.

## Acceptance criteria

- [ ] Repo exists at `github.com/forumone/claude-cms` with Turborepo + pnpm workspaces
- [ ] Shared TypeScript, ESLint, Prettier configs exist as internal packages
- [ ] Changesets is initialized and configured for `@forumone` scope
- [ ] CI workflow runs build, typecheck, lint, test on every PR
- [ ] Release workflow is connected to npm and creates release PRs on changeset merges
- [ ] npm publish access is verified (either via smoke-test round-trip or trusted setup)
- [ ] Branch protection on main requires PR + CI + review
- [ ] README, CONTRIBUTING, and LICENSE exist
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all run cleanly from root

## Notes for Claude Code

- Almost every step here is a template fill-in. Claude Code should not deviate from standard conventions for any of this — the value is in getting the setup right, not in making novel choices.
- The hardest part of this phase is usually npm publishing. If you hit auth errors, the usual causes are: missing NPM_TOKEN secret, token scoped to wrong scope, two-factor authentication required but no automation token generated. Check these before debugging further.
- Don't add any packages beyond smoke-test in this phase. It's tempting to scaffold C1's package now, but every added package is another thing that has to work before moving on. Keep this phase minimal.
- The internal config packages (`@forumone/claude-cms-tsconfig` etc.) are private (`"private": true`) and should not be in any package's `dependencies` — they're `devDependencies`. This is important because published packages should not force consumers to install our internal configs.
- If you're tempted to add a `test` script that does nothing in the smoke-test package, don't. Write a real (trivial) test. The pipeline needs to prove it can run tests.
- Commit after each major task (C0.4, C0.5, C0.6, C0.8) so recovery is easy if something goes wrong.

## What's next

Phase C1 defines the plugin architecture — the contract that every core package satisfies when it's consumed by a client app. This is the most important architectural decision in the whole project because it determines what "consuming core" looks like for a client project. After C1 there's a pattern every subsequent package follows.

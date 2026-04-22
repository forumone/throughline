# Contributing to throughline

## Branching

- `main` is protected. Push a feature branch and open a PR.
- Keep PRs focused. Smaller reviews land faster.
- Linear history is preferred — rebase rather than merge when bringing `main` into your branch.

## Changesets

Any change to a published package needs a changeset. After making your change:

```bash
pnpm changeset
```

Select the packages you changed, choose `patch`, `minor`, or `major` per semver, and write a one-line summary. This creates a `.changeset/*.md` file — commit it alongside your change. When your PR merges, Changesets aggregates these into a release PR that bumps versions, updates changelogs, and publishes on merge.

Internal config packages (`@forumone/throughline-tsconfig`, `-eslint-config`, `-prettier-config`) are ignored by changesets and never publish. Changes to them don't need a changeset.

## Commits

- Use present-tense, imperative commit messages ("add X", not "added X").
- Commit messages should explain the _why_ — the _what_ is in the diff.

## Code review

- CI (build, typecheck, lint, test) must pass.
- Prefer a reviewer who knows the affected area.
- Respond to comments; don't silently force-push resolved threads.

## Local development

```bash
pnpm install
pnpm build       # turbo run build across all packages
pnpm test        # vitest per package
pnpm typecheck
pnpm lint
pnpm format      # prettier --write .
```

Run a single package's scripts with `pnpm --filter <name> <script>`, e.g. `pnpm --filter @forumone/throughline-smoke-test test`.

## Publishing

You do not publish directly. The release workflow (`.github/workflows/release.yml`) opens a "Version Packages" PR whenever unreleased changesets exist on `main`. Merging that PR publishes to npm with provenance.

Required repo secrets:

- `NPM_TOKEN` — granular token with publish access to the `@forumone` scope.

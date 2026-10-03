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

`@forumone/throughline`, `@forumone/throughline-design-system` and `@forumone/create-throughline` are one changesets `fixed` group: they release together, at one version. A changeset for any of them moves all three, so name the one you changed.

### Snapshots

A pull request that touches a published package publishes a snapshot of all three, `<version>-pr-<n>-<sha>` under the `pr` dist-tag, from the PR's head. The version is in the run's summary, so a site's pull request can install the change before this one merges:

```bash
pnpm add @forumone/throughline@1.0.0-pr-264-a1b2c3d
```

Install the exact version, never `@pr`: the tag moves with every pull request. Renovate's branches and the release PR publish nothing.

Every merge to `main` with changesets pending publishes `<next version>-next-<sha>` under `next` the same way, so `next` is always what the next release holds. The script is `scripts/publish-snapshot.sh`; it versions the checkout and never commits or tags.

### 0.x fixes go to `v0`

**A fix for 0.x goes to `v0`**, the branch cut from the last 0.x release: base your branch and your pull request on `v0`. Its release PR opens against `v0` and publishes under the `v0` dist-tag, so it never moves `latest` off 1.x. If 1.x needs the fix too, port it to `main` by hand. See [the 1.0 plan](docs/spec/1.0-plan.md#distribution).

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

Run a single package's scripts with `pnpm --filter <name> <script>`, e.g. `pnpm --filter @forumone/throughline-tsconfig build`.

## Publishing

You do not publish directly. The release workflow (`.github/workflows/release.yml`) opens a "Version Packages" PR whenever unreleased changesets exist on `main`. Merging that PR publishes to npm with provenance.

Authentication to npm uses [trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers), not a long-lived token. The release workflow requests a short-lived token from npm at run time, proving its identity via GitHub's OIDC provider. No `NPM_TOKEN` secret is required.

npm-side configuration required once per package (or once at the `@forumone` scope, if your plan supports org-level trusted publishers):

- Publisher: GitHub Actions
- Organization: `forumone`
- Repository: `throughline`
- Workflow filename: `release.yml`
- Environment: _(blank)_

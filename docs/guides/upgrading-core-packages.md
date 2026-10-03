# Upgrading core packages

Goal: track Throughline's releases, read breaking-change notes, and apply upgrades in your client project safely.

**Moving from 0.x to 1.0 is a one-time change of its own:** see [Upgrading from 0.x to 1.0](upgrading.md). This guide is about the releases after it.

## How releases work upstream

Throughline uses [Changesets](https://github.com/changesets/changesets). Every PR that ships user-visible behavior includes a `.changeset/*.md` file declaring the affected packages and the bump type (`major` / `minor` / `patch`).

From 1.0 there are three published packages, `@forumone/throughline`, `@forumone/throughline-design-system` and `@forumone/create-throughline`, and they release together, at one version. A site upgrades one number, not fourteen.

When a release PR merges:

- All three packages take the same version
- Each package's `CHANGELOG.md` is appended with the changesets' prose
- A git tag per package is created (`@forumone/throughline@1.2.0`)
- Trusted publishing pushes the new versions to npm

**Dist-tags:** `latest` is the current release. `next` is a snapshot of `main` after every merge, `<next version>-next-<sha>`, so a site can try what the next release holds; while 1.0 itself was in pre-release it was the `1.0.0-next.N` line. `v0` is the 0.x line, fixed from the `v0` branch. `pr` is a snapshot of an open pull request, `<version>-pr-<n>-<sha>`: install it by exact version, to try a fix before it merges.

## Reading the changelog

Each package has a `CHANGELOG.md` at `packages/<name>/CHANGELOG.md` in the core repo, and the same file is published to npm. Browse with:

```bash
npm view @forumone/throughline versions
npm view @forumone/throughline@latest changelog
# or just open packages/throughline/CHANGELOG.md on GitHub
```

Entries follow the Changesets format:

```
## 0.4.0

### Minor Changes

- 1a2b3c4: Add `accessibilityChecks` option to publishingPlugin. Existing
  configs continue to work with no checks registered.

### Patch Changes

- 5d6e7f8: Fix race in scheduled-publish runner when two crons fire
  within the same minute.
```

Read every minor and major before upgrading. Patches are usually safe-by-construction but glance at them anyway.

## When to upgrade

The lazy answer: monthly. Upgrade everything to the latest at a fixed cadence and ride the small accumulated diffs. This stays close to upstream without making upgrades a project.

The reactive answer: when a feature you want lands or a bug you've hit gets fixed. Subscribe to the GitHub repo's releases (Watch → Custom → Releases) and upgrade selectively.

Both are reasonable. The lazy approach is easier to maintain on a multi-engineer team because nobody has to remember "we're four versions behind."

## Upgrading

```bash
# In your client project root
pnpm update @forumone/throughline @forumone/throughline-design-system --latest
```

`--latest` ignores the version range and takes the newest release. Without it, pnpm respects your `^1.0.0` (or whatever) range and skips a major. The two packages are always the same version, so update them together.

After updating:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm --dir apps/web generate:importmap   # an admin component may have moved
```

`pnpm install` updates the lockfile. `typecheck` catches most type-level breakage from a major. `test` catches behavior-level regressions if you have coverage on the integration points.

## Major-version upgrades

From 1.0, a major is the only release that may break a site. Each major's changelog has a "Migration" section listing every breaking change and how to update, and a major that moves imports ships a codemod with it, as 1.0 did (`throughline migrate-imports`).

Pattern for a major:

1. Read the migration section
2. Run the codemod, if the major has one
3. Run typecheck: TypeScript will tell you what's broken
4. Fix in the order TypeScript reports (it usually clusters logically)
5. Run `migrate:create`: a major that changes the schema says so, and one that does not should produce nothing
6. Run tests, then commit

## Pinning a version

If a release breaks something and you can't immediately work around it, pin to the previous version:

```json
{
  "dependencies": {
    "@forumone/throughline": "1.2.0",
    "@forumone/throughline-design-system": "1.2.0"
  }
}
```

(Note: no caret. Exact version, and the same one for both.)

Then file an issue upstream describing the regression. Once it's fixed, unpin and update.

## What changes when

| Stability    | What it covers                                                                 | Bump if changed |
| ------------ | ------------------------------------------------------------------------------ | --------------- |
| **Strong**   | `throughline()`'s options; each plugin's function signature; option type names | Major           |
| **Strong**   | Subpath exports: a name's path (`@forumone/throughline/publishing`)            | Major           |
| **Strong**   | Event names + payload shapes (taxonomy in `@forumone/throughline/jobs`)        | Major           |
| **Strong**   | Job function ids: a changed id would orphan a run in flight                    | Major           |
| **Strong**   | Collection slugs and field names: a change is a data migration                 | Major           |
| **Moderate** | MCP tool names + input schemas                                                 | Major           |
| **None**     | Anything not exported from a subpath in `package.json`                         | Any             |

The "Major if changed" rule means real majors are deliberate. A surprise breaking change in a minor is a bug.

## Reading the spec for context

The docs at `docs/spec/C0`–`docs/spec/C14` describe the original build phases, and `docs/spec/1.0-*.md` the 1.0 consolidation. They're a useful reference when reading "why was this designed this way?" but they don't track the live API surface — for that, read the package READMEs and changelogs.

## Where to look in code

- `.changeset/*.md` — changesets _waiting_ to be released, on a release branch
- `packages/<name>/CHANGELOG.md` — released history per package
- The repo's release PRs — auto-opened by the Changesets bot, listing every pending bump

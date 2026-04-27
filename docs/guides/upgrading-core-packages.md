# Upgrading core packages

Goal: track Throughline's releases, read breaking-change notes, and apply upgrades in your client project safely.

## How releases work upstream

Throughline core uses [Changesets](https://github.com/changesets/changesets). Every PR that ships user-visible behavior includes a `.changeset/*.md` file declaring the affected packages and the bump type (`major` / `minor` / `patch`).

When core merges a release PR:

- Each package gets its own version bump
- Each package's `CHANGELOG.md` is appended with the changeset's prose
- A git tag per package is created (`@forumone/throughline-publishing@0.4.0`)
- Trusted publishing pushes the new versions to npm

You'll see a constant stream of small bumps rather than infrequent large bumps.

## Reading the changelog

Each package has a `CHANGELOG.md` at `packages/<name>/CHANGELOG.md` in the core repo, and the same file is published to npm. Browse with:

```bash
npm view @forumone/throughline-publishing versions
npm view @forumone/throughline-publishing@latest changelog
# or just open packages/publishing/CHANGELOG.md on GitHub
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

Both are reasonable. The lazy approach is easier to maintain on a multi-engineer team because nobody has to remember "we're four versions behind on `publishing`."

## Upgrading

```bash
# In your client project root
pnpm update @forumone/throughline-* --latest
```

`--latest` ignores the version range pin and grabs the newest available. Without it, pnpm respects your `^0.2.0` (or whatever) range and skips minor/major bumps.

For a single package:

```bash
pnpm update @forumone/throughline-publishing --latest
```

After updating:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm install` updates the lockfile. `typecheck` will catch most type-level breakage from a major. `test` catches behavior-level regressions if you have coverage on the integration points.

## Major-version upgrades

Throughline is pre-1.0. Most majors will be small and surgical (a renamed export, a removed deprecated option). Each major's changelog includes a "Migration" section listing every breaking change and how to update.

Pattern for a major:

1. Read the migration section
2. Update one package at a time, not all at once
3. Run typecheck after each package — TypeScript will tell you exactly what's broken
4. Fix in the order TypeScript reports (it usually clusters logically)
5. Run tests
6. Commit

Don't bundle multiple package majors into one commit. If a regression surfaces, single-package commits are bisectable.

## Pinning a version

If a release breaks something and you can't immediately work around it, pin to the previous version:

```json
{
  "dependencies": {
    "@forumone/throughline-publishing": "0.3.7"
  }
}
```

(Note: no caret. Exact version.)

Then file an issue upstream describing the regression. Once it's fixed, unpin and update.

## Pinning across packages

Pre-1.0, the framework's packages don't promise version compatibility across packages. Two packages at `0.4.x` are tested together; `@forumone/throughline-publishing@0.5.0` paired with `@forumone/throughline-approvals@0.3.5` is not. If you pin one, ideally pin all.

The CLI scaffolder writes `^0.2.0`-style ranges that allow minor bumps but not majors. Keep that pattern unless you have a reason not to.

## What changes when

Throughline's plugin authors maintain a few deliberate stability promises:

| Stability | What it covers | Bump if changed |
| --- | --- | --- |
| **Strong** | Plugin function signature; option type names | Major |
| **Strong** | Event names + payload shapes (taxonomy in `@forumone/throughline-core`) | Major |
| **Moderate** | MCP tool names + input schemas | Major |
| **Moderate** | Symbol-keyed accessor names (`getEmailFunctions` etc.) | Major |
| **Lower** | Internal helpers re-exported from `_internal/` paths | Minor |
| **None** | Anything not exported from the package's main entry | Any |

The "Major if changed" rule means real majors are deliberate. A surprise breaking change in a minor is a bug.

## Reading the spec for context

The docs at `docs/spec/C0`–`docs/spec/C14` describe the original build phases. They're a useful reference when reading "why was this designed this way?" but they don't track the live API surface — for that, read the package READMEs and changelogs.

## What you usually upgrade together

- `@forumone/throughline-publishing` + `@forumone/throughline-approvals` (publish pipeline + approval gate)
- `@forumone/throughline-email` + `@forumone/throughline-approvals` + `@forumone/throughline-forms` (the three packages that compose to send transactional mail)
- `@forumone/throughline-workflows` + everything (workflows subscribes to all event types)

The "upgrade everything together" path avoids the cross-version compatibility question.

## Where to look in code

- `.changeset/*.md` — changesets *waiting* to be released, on a release branch
- `packages/<name>/CHANGELOG.md` — released history per package
- The repo's release PRs — auto-opened by the Changesets bot, listing every pending bump

# {{projectName}}

A **Throughline** project: a Payload CMS application (`apps/web`) wired to the
Throughline plugin suite, plus the design system that supplies its component
vocabulary. Throughline docs: https://github.com/forumone/throughline

```
apps/web/          Next.js + Payload host
design-system/     The design system and its Storybook
scripts/           Workspace gates, each explained at the top of its file
.github/           CI: `fast` on every pull request, `verify` on main
```

## The gate

This is what CI's `fast` job runs, in its order. Run it before calling work
done:

```bash
pnpm install --frozen-lockfile \
  && pnpm typecheck && pnpm lint \
  && pnpm check:instances && pnpm check:tested && pnpm check:migrations \
  && pnpm validate \
  && pnpm --filter ./design-system run --if-present build \
  && bash .github/scripts/check-generated.sh \
  && pnpm test
```

`fast` then runs `pnpm check:audit`, which reports advisories without failing
the job.

`--frozen-lockfile` leads because a lockfile missing an entry passes every
other gate locally and fails in CI. `check-generated.sh` needs the environment
`payload.config.ts` validates; the placeholders at the top of
`.github/workflows/ci.yml` are enough — it parses the connection string and
never connects.

`verify` adds a migrated Postgres and `pnpm build`; it runs on main.

A Stop hook (`.claude/hooks/gate.sh`) runs typecheck and lint when a session
ends with pending changes. It reports and never blocks. Set
`THROUGHLINE_SKIP_GATE=1` to silence it.

## Generated files are committed — never hand-edit them

After any change to `payload.config.ts`, a collection or a plugin version:

```bash
pnpm --dir apps/web generate:types       # -> src/payload-types.ts
pnpm --dir apps/web generate:importmap   # -> src/app/(payload)/admin/importMap.js
```

Commit both. CI regenerates them and fails on a difference. A stale import map
is a 500 on any admin screen that renders a component it has never heard of;
stale types make everything downstream compile against a schema that no longer
exists.

## Schema changes go through migrations

`push` is off, in development too: `apps/web/src/migrations` is the only way the
schema changes.

```bash
pnpm --dir apps/web migrate:create <name>   # diffs the config against the newest snapshot
pnpm --dir apps/web migrate                 # apply
pnpm --dir apps/web migrate:snapshot        # only after hand-writing a migration
```

`migrate:create` diffs against the `.json` snapshot beside the newest migration,
**not the database**. A hand-written migration without its snapshot leaves the
generator a step behind, re-proposing changes that already shipped.
`check:migrations` fails on a missing or orphaned snapshot, and on a drop that a
`CASCADE` has already carried out.

The `payload` CLI loads `.env.local`; `tsx` scripts load nothing. For anything
that writes to a database, pass the variables on the command line and use
`requireTarget` from `apps/web/scripts/lib/target.ts`, which prints the target
and demands `--confirm` before overwriting.

## The design system reaches the CMS through its manifest

`payload.config.ts` hands the design system's manifest to the `components` key
of its `throughline()` call, and that manifest is how the CMS knows which components exist and how they may
be composed. It is built from a `<Name>.contract.ts` beside every component.
{{#if useReferenceDs}}
- **A new component needs a contract.** `build:manifest` refuses a component
  directory without one; prefix a directory with `_` if it is not a component.
- **`pnpm validate` must pass.** It catches an unknown token, a composition rule
  naming a component that does not exist, and an example pointing at a story
  that is not there.
{{else}}
The design system here is a placeholder. When you build it, give every
component a contract, publish a manifest, and point `components.manifest` in
`throughline()` at it — see `@forumone/throughline-design-system` in the
Throughline repository.
{{/if}}
## Tests

`check:tested` requires at least one test in every package that ships code.

`apps/web` starts with one: `src/access/anonymousAccess.test.ts`, which
`pnpm test` runs through a vitest config that loads `payload.config.ts` without
a database. It puts every collection in one of two buckets: read by the
rendered site, so anonymous reads must be allowed, or private, so they must be
refused. A new collection fails it until you add it to a bucket. Decide which,
and don't open a collection to anonymous reads to make the test pass. More good
first tests need no database: field validations, and hooks as functions.

`pnpm --dir apps/web test:smoke` runs the Playwright smoke pack in `e2e/` against
`next start`, so build first, or against a deployed site when `E2E_BASE_URL`
is set. Every check is a GET. CI runs it in `verify`, after the production
build. Add routes to `e2e/site.ts` as the site gains them.

## Conventions

- pnpm only. The lockfile is at the root.
- Open a pull request for review; do not merge your own.

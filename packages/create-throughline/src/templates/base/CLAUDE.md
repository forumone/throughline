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
  && bash .github/scripts/check-generated.sh \
  && pnpm test
```

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

`payload.config.ts` hands the design system's manifest to `componentsPlugin`,
and that manifest is how the CMS knows which components exist and how they may
be composed. It is built from a `<Name>.contract.ts` beside every component.
{{#if useReferenceDs}}
- **A new component needs a contract.** `build:manifest` refuses a component
  directory without one; prefix a directory with `_` if it is not a component.
- **`pnpm validate` must pass.** It catches an unknown token, a composition rule
  naming a component that does not exist, and an example pointing at a story
  that is not there.
{{else}}
The design system here is a placeholder. When you build it, give every
component a contract, publish a manifest, and point `componentsPlugin` at it —
see the design-contract package in the Throughline repository.
{{/if}}
## Tests

`check:tested` requires at least one test in every package that ships code.
`apps/web` starts on its exception list in `scripts/check-tested-packages.ts`;
delete that entry with its first test. Good first tests are the ones that need
no database: access rules as values, field validations, hooks as functions.

## Conventions

- pnpm only. The lockfile is at the root.
- Open a pull request for review; do not merge your own.

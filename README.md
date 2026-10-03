# @forumone/throughline

A conversational content management framework. Exposes Payload CMS as a set of MCP tools so marketers can operate websites through Claude rather than a traditional admin UI.

## Documentation

Full documentation lives at [`docs/`](./docs/) — getting-started tutorials, conceptual explanations of the architecture, how-to guides, per-package reference, and operations docs. Start at [`docs/README.md`](./docs/README.md).

## Status

1.0 is in pre-release: `1.0.0-next.N` under the `next` dist-tag, while 0.x fixes go to the `v0` branch and publish to `latest`. See [`docs/roadmap.md`](./docs/roadmap.md) for phase status, and [Upgrading from 0.x to 1.0](./docs/guides/upgrading.md) to move a site.

## Packages

Three published packages, released together at one version:

- [`@forumone/throughline`](./packages/throughline) — `throughline()`, which registers the suite, and each part on its own subpath: publishing, approvals, the audit log, components, integrations, email, editorial reports, media, the field kit, and background jobs on Inngest or Payload Jobs
- [`@forumone/throughline-design-system`](./packages/design-system) — the component contract and manifest, its lint, and the manifest's Payload blocks, rendering and admin components
- [`@forumone/create-throughline`](./packages/create-throughline) — the scaffolder (`pnpm create @forumone/throughline my-site`), with the brand-neutral reference design system a new project starts from

Internal, non-published config packages:

- `@forumone/throughline-tsconfig` — shared TypeScript configs
- `@forumone/throughline-eslint-config` — shared ESLint flat config
- `@forumone/throughline-prettier-config` — shared Prettier config

## Using in a client project

The fastest path is the scaffolder:

```bash
pnpm create @forumone/throughline my-client-site
```

It asks a small set of questions and produces a pnpm monorepo with Payload, the suite registered by `throughline()`, and an Inngest endpoint already wired. The full walkthrough is at [`docs/getting-started/scaffolding-a-project.md`](./docs/getting-started/scaffolding-a-project.md).

Or add the packages to a Payload site:

```bash
pnpm add @forumone/throughline@next @forumone/throughline-design-system@next
```

See [`docs/reference/`](./docs/reference/) for the reference.

## Development

Requirements: Node.js 20.9+ and pnpm 10+.

```bash
pnpm install
pnpm build
pnpm test
```

Author changes and add a changeset:

```bash
pnpm changeset
```

Open a PR. CI runs build, typecheck, lint, and test. On merge to `main`, Changesets opens a release PR that publishes to npm on merge.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

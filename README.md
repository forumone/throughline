# @forumone/throughline

A conversational content management framework. Exposes Payload CMS as a set of MCP servers so marketers can operate websites through Claude rather than a traditional admin UI.

## Documentation

Full documentation lives at [`docs/`](./docs/) — getting-started tutorials, conceptual explanations of the architecture, how-to guides, per-package reference, and operations docs. Start at [`docs/README.md`](./docs/README.md).

## Status

Pre-1.0. APIs will change. See [`docs/roadmap.md`](./docs/roadmap.md) for phase status and [`docs/spec/`](./docs/spec/) for the original build plan.

## Packages

Published packages live in `packages/`. Each has its own README.

Plugins:

- `@forumone/throughline-core` — audit log, MCP auth + handler, Inngest client, env helpers
- `@forumone/throughline-components` — components MCP server (manifest-driven content drafting)
- `@forumone/throughline-publishing` — publishing MCP server (publish + scheduled publish, with policy gates)
- `@forumone/throughline-approvals` — approvals MCP server + tokenized email decisions
- `@forumone/throughline-audit` — read-only MCP query tools over the audit log
- `@forumone/throughline-integrations` — pluggable third-party integrations (webhook included)
- `@forumone/throughline-email` — Resend-backed transactional email + React Email templates
- `@forumone/throughline-forms` — Form Builder wrapper with allowlisted destinations + spam/rate-limit hardening
- `@forumone/throughline-workflows` — Inngest workflow factories (revalidate, scheduled publish, expire approvals, healthchecks)

Design system:

- `@forumone/throughline-design-contract` — manifest schema + lint rules
- `@forumone/throughline-reference-ds` — brand-neutral 12-component reference design system

Tooling:

- `@forumone/create-throughline` — interactive scaffolder (`pnpm create @forumone/throughline my-site`)

Internal, non-published config packages:

- `@forumone/throughline-tsconfig` — shared TypeScript configs
- `@forumone/throughline-eslint-config` — shared ESLint flat config
- `@forumone/throughline-prettier-config` — shared Prettier config

## Using in a client project

The fastest path is the scaffolder:

```bash
pnpm create @forumone/throughline my-client-site
```

It asks a small set of questions and produces a pnpm monorepo with Payload, every Throughline plugin, and an Inngest endpoint already wired. The full walkthrough is at [`docs/getting-started/scaffolding-a-project.md`](./docs/getting-started/scaffolding-a-project.md).

Or consume the published packages directly:

```bash
pnpm add @forumone/throughline-core @forumone/throughline-publishing
```

See [`docs/reference/`](./docs/reference/) for per-package reference.

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

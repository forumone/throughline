# @forumone/throughline

A conversational content management framework. Exposes Payload CMS as a set of MCP servers so marketers can operate websites through Claude rather than a traditional admin UI.

## Status

Pre-1.0. APIs will change. See `docs/spec/` for the phased build plan.

## Packages

Published packages live in `packages/`. Each has its own README.

Internal, non-published config packages:

- `@forumone/throughline-tsconfig` — shared TypeScript configs
- `@forumone/throughline-eslint-config` — shared ESLint flat config
- `@forumone/throughline-prettier-config` — shared Prettier config

## Using in a client project

A client scaffolder (`create-claude-cms`) will be provided in phase C13. Until then, consume the published packages directly:

```bash
pnpm add @forumone/throughline-core @forumone/throughline-publishing
```

See the getting-started guide (forthcoming in C14) for a full walkthrough.

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

# @forumone/create-throughline

Interactive scaffolder for new Throughline projects. Run with `pnpm create @forumone/throughline <project-name>` to produce a pnpm monorepo with Payload, all Throughline plugins wired, an Inngest endpoint, and an `.env.example`.

## Usage

```bash
pnpm create @forumone/throughline my-site
```

Or via npm:

```bash
npm create @forumone/throughline@latest my-site
```

The CLI asks seven questions:

| # | Question | Default |
| --- | --- | --- |
| 1 | Project name | matches your directory name |
| 2 | npm scope (without `@`) | blank |
| 3 | Use the reference design system? | yes |
| 4 | Deployment platform | vercel |
| 5 | Postgres provider | neon |
| 6 | Initialize git? | yes |
| 7 | Install dependencies? | yes |

See [Scaffolding a project](../getting-started/scaffolding-a-project.md) for the full walkthrough.

## What it generates

```
my-site/
├── apps/
│   └── web/                                     # Next.js 16 + Payload 3.83
│       ├── src/
│       │   ├── payload.config.ts                # all plugins wired, with TODOs
│       │   ├── app/
│       │   │   ├── (frontend)/                  # placeholder home page
│       │   │   ├── (payload)/                   # admin + REST routes
│       │   │   └── api/
│       │   │       └── inngest/route.ts         # all framework functions registered
│       │   └── ...
│       └── ...
├── packages/
│   └── design-system/                           # reference DS re-export, or placeholder
├── .env.example                                 # every required secret listed
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.json
└── README.md                                    # setup instructions
```

## Public API

The CLI is primarily an interactive binary, but its internal modules are exported for testing and programmatic use:

```typescript
import {
  gatherAnswers,
  generate,
  renderTemplate,
  printNextSteps,
  validateProjectName,
  validatePackageScope,
} from '@forumone/create-throughline'

import type {
  Answers,
  GenerateOptions,
} from '@forumone/create-throughline'
```

### `Answers`

```typescript
interface Answers {
  targetDir: string                            // absolute
  projectName: string
  packageScope: string                         // empty string = no scope
  useReferenceDs: boolean
  initializeGit: boolean
  installDeps: boolean
  deploymentPlatform: 'vercel' | 'railway' | 'fly' | 'other'
  databasePlatform: 'neon' | 'supabase' | 'self-hosted-postgres'
}
```

### `gatherAnswers({ targetDir })`

Drives the `@clack/prompts` flow. Validates inputs, exits early if `targetDir` already exists.

### `generate(answers, options)`

Generates the project at `answers.targetDir`. Always:

- Creates the directory and copies `templates/base/` with `{{var}}` and `{{#if}}` substitution applied
- Layers either `templates/with-reference-ds/` or `templates/without-reference-ds/`

If `options.skipSideEffects` is false (the default in production):

- Optionally runs `git init` + initial commit
- Optionally runs `pnpm install`

Tests pass `skipSideEffects: true`.

### `renderTemplate(template, data)`

Minimal mustache-style renderer:

```typescript
renderTemplate('hi {{name}}', { name: 'Ada' })             // 'hi Ada'
renderTemplate('{{#if ok}}A{{else}}B{{/if}}', { ok: true }) // 'A'
```

Supports `{{variable}}`, `{{#if variable}}`, `{{else}}`, `{{/if}}`. No nesting, no helpers, no escapes. Variables inside if blocks expand correctly via two-pass replacement (if-blocks first, then variables).

### `validateProjectName(value)` / `validatePackageScope(value)`

Return an error string if invalid, `undefined` if OK. Used by the prompts and exposed for clients that drive the CLI programmatically.

## Templates

Templates live in `src/templates/` (and ship as `dist/templates/` after build). Three roots:

- `base/` — files every project gets
- `with-reference-ds/` — overlay applied when `useReferenceDs: true`
- `without-reference-ds/` — overlay applied when `useReferenceDs: false`

Files with the `.template` suffix have it stripped after rendering. This lets us author template TS files like `payload.config.ts.template` without TypeScript treating them as broken syntax during development.

## Programmatic invocation

Useful for tests and integration scripts:

```typescript
import { generate } from '@forumone/create-throughline'

await generate(
  {
    targetDir: '/tmp/test-project',
    projectName: 'test',
    packageScope: 'acme',
    useReferenceDs: true,
    initializeGit: false,
    installDeps: false,
    deploymentPlatform: 'vercel',
    databasePlatform: 'neon',
  },
  { skipSideEffects: true },
)
```

## Versioning

The scaffolder writes `^0.2.0`-style ranges for Throughline packages. New project starts pick up minor updates automatically; majors require a deliberate `pnpm update --latest`. See [Upgrading core packages](../guides/upgrading-core-packages.md).

## Related

- Tutorial: [Scaffolding a project](../getting-started/scaffolding-a-project.md)
- Concept: [Client-agnostic core](../concepts/client-agnostic-core.md)

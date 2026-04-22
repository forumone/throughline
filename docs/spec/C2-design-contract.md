# Phase C2 — Design Contract Package

## Goal

Build `@forumone/claude-cms-design-contract` — the package that defines what it means to be an AI-ready design system in this framework. Exports: the Zod schema for component contracts, the manifest format, the manifest loader, the CI lint rules for validating a design system against the contract. Every design system (the reference DS in C3, the Forum One Agentic Design System in F2, every future client's DS) satisfies this contract.

## Prerequisites

- C0 complete; monorepo and publishing pipeline operational
- C1 complete; plugin contract and building-plugins guide in place

## Context

This package is small in code size and enormous in importance. It's the contract that makes "fully swappable" design systems actually work. Any design system that satisfies this contract is a valid input to the Component Server (C5), the Publishing Server (C6), and the client app's rendering layer.

The contract has four parts:

**The component contract schema** — what metadata a design system publishes for each component. Identity, intent, composition rules, content contract, token bindings, accessibility, examples, anti-examples. This is the Phase 04 schema from the original spec, now extracted to its own package so both the reference DS and real client DSes can consume it identically.

**The manifest format** — the aggregated, versioned JSON produced by a design system's build. Contains every component's contract plus metadata about the design system itself (name, version, token version, build timestamp).

**The manifest loader** — a function that takes a manifest (from an import or a URL) and returns a validated, queryable object with helpful methods (`getComponent`, `findByCategory`, `listCategories`). Used by the Component Server to read any design system.

**The lint rules** — CI-runnable checks that verify a design system's contracts are internally consistent. Every component has a contract. Every contract references real tokens. Every example references a real Storybook story. These rules run in the design system's own repo (not in core), so this package exports them as functions the DS's CI consumes.

Key design decisions:

- **Zero runtime dependencies beyond Zod.** This package gets imported by every design system and every client app. It must be light.
- **Schema versioning from day one.** The manifest includes a `contractVersion` field. When we evolve the schema (we will), we can detect mismatched versions and provide migration guidance.
- **Strict validation on load.** A manifest that fails validation throws immediately. We never partially load invalid data. The cost of strictness is clear error messages; the benefit is never debugging why Claude recommended a component that doesn't exist.

## Tasks

### C2.1 — Scaffold the package

Create `packages/design-contract/`:

```
packages/design-contract/
├── src/
│   ├── index.ts
│   ├── schema.ts
│   ├── manifest.ts
│   ├── loader.ts
│   ├── lint.ts
│   └── types.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── CHANGELOG.md
```

`package.json`:

```json
{
  "name": "@forumone/claude-cms-design-contract",
  "version": "0.1.0",
  "description": "The contract every AI-ready design system satisfies to be consumable by the Claude-First CMS.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./lint": {
      "types": "./dist/lint.d.ts",
      "default": "./dist/lint.js"
    }
  },
  "files": ["dist", "README.md", "CHANGELOG.md"],
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b -w",
    "clean": "rm -rf dist .turbo",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "keywords": ["claude-cms", "design-system", "ai-ready", "payload"],
  "license": "MIT",
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-eslint-config": "workspace:*",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Note: the `./lint` subpath export lets consumers import lint helpers separately — `import { lintManifest } from '@forumone/claude-cms-design-contract/lint'` — keeping the main entry small for apps that only need runtime loading.

### C2.2 — Define the component contract schema

`src/schema.ts`:

```typescript
import { z } from 'zod'

/**
 * The current version of the contract schema. Bump this when making
 * backwards-incompatible changes.
 */
export const CONTRACT_VERSION = '1.0.0'

const FieldTypeSchema = z.enum([
  'text',
  'richtext',
  'link',
  'image',
  'video',
  'select',
  'group',
  'array',
  'boolean',
  'number',
])

const PlacementSchema = z.enum(['page', 'section', 'inline'])

const CategorySchema = z.enum([
  'hero',
  'section',
  'card',
  'media',
  'cta',
  'navigation',
  'data',
  'form',
  'utility',
])

const ContentFieldSchema = z.object({
  name: z.string().min(1),
  type: FieldTypeSchema,
  required: z.boolean().default(false),
  maxLength: z.number().int().positive().optional(),
  /** Human-readable constraint description for the AI to reason about. */
  constraints: z.string().optional(),
  /** If this field is an array or group, describe the nested shape. */
  of: z.array(z.lazy((): z.ZodType => ContentFieldSchema)).optional(),
})

export const ComponentContractSchema = z.object({
  // Identity
  name: z.string().min(1).regex(/^[A-Z][A-Za-z0-9]+$/, 'Component names must be PascalCase'),
  category: CategorySchema,
  description: z.string().min(20).max(280),
  intent: z.string().min(20).max(500),

  // Composition
  composition: z.object({
    placement: z.array(PlacementSchema).nonempty(),
    maxPerPage: z.number().int().positive().nullable().default(null),
    requiredSiblings: z.array(z.string()).default([]),
    forbiddenAdjacent: z.array(z.string()).default([]),
    allowedSlots: z.record(z.string(), z.array(z.string())).optional(),
  }),

  // Content
  content: z.object({
    fields: z.array(ContentFieldSchema),
    variants: z
      .array(
        z.object({
          name: z.string(),
          description: z.string(),
          whenToUse: z.string(),
        }),
      )
      .optional(),
  }),

  // Tokens
  tokens: z.object({
    consumes: z.array(z.string()),
    configurable: z
      .array(
        z.object({
          prop: z.string(),
          tokenGroup: z.string(),
          allowedValues: z.array(z.string()),
        }),
      )
      .optional(),
  }),

  // Accessibility
  accessibility: z.object({
    role: z.string().optional(),
    keyboardSupport: z.array(z.string()).default([]),
    screenReaderBehavior: z.string().min(10),
    contentWarnings: z.array(z.string()).default([]),
  }),

  // Examples
  examples: z
    .array(
      z.object({
        label: z.string(),
        intent: z.string(),
        storyId: z.string(),
      }),
    )
    .min(1, 'Each component must have at least one example'),

  antiExamples: z
    .array(
      z.object({
        label: z.string(),
        why: z.string(),
        useInstead: z.string().optional(),
      }),
    )
    .default([]),

  // Behavioral
  behavior: z
    .object({
      fetchesData: z.boolean().default(false),
      hasClientState: z.boolean().default(false),
      animates: z.boolean().default(false),
      requiresAnalytics: z.boolean().default(false),
    })
    .default({}),
})

export type ComponentContract = z.infer<typeof ComponentContractSchema>
```

Note on the recursive ContentFieldSchema: Zod's `z.lazy()` handles self-referential schemas. The type annotation is needed because TypeScript can't infer recursive types through `z.lazy()`.

### C2.3 — Define the manifest schema

`src/manifest.ts`:

```typescript
import { z } from 'zod'
import { CONTRACT_VERSION, ComponentContractSchema } from './schema'

const TokenDefinitionSchema = z.object({
  name: z.string(),
  value: z.string(),
  category: z.string(),
})

export const ManifestSchema = z.object({
  /** The version of the contract schema this manifest satisfies. */
  contractVersion: z.literal(CONTRACT_VERSION),

  /** Metadata about the design system. */
  designSystem: z.object({
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    homepage: z.string().url().optional(),
    storybookUrl: z.string().url().optional(),
  }),

  /** All tokens exposed by this design system. Components reference them by name. */
  tokens: z.array(TokenDefinitionSchema),

  /** The components, keyed by name. */
  components: z.record(z.string(), ComponentContractSchema),

  /** Build metadata. */
  build: z.object({
    timestamp: z.string().datetime(),
    source: z.string().optional(),
  }),
})

export type Manifest = z.infer<typeof ManifestSchema>
```

### C2.4 — Build the manifest loader

`src/loader.ts`:

```typescript
import { ManifestSchema, type Manifest } from './manifest'
import type { ComponentContract } from './schema'

export class LoadedManifest {
  constructor(public readonly raw: Manifest) {}

  /** Returns the full contract for a component by name. */
  getComponent(name: string): ComponentContract | undefined {
    return this.raw.components[name]
  }

  /** Throws if the component doesn't exist. Use when the component is expected to exist. */
  requireComponent(name: string): ComponentContract {
    const component = this.getComponent(name)
    if (!component) {
      throw new Error(`Component "${name}" not found in manifest`)
    }
    return component
  }

  /** Lists every component name. */
  listComponents(): string[] {
    return Object.keys(this.raw.components)
  }

  /** Lists components filtered by category. */
  listByCategory(category: string): ComponentContract[] {
    return Object.values(this.raw.components).filter((c) => c.category === category)
  }

  /** Lists every distinct category present in this manifest. */
  listCategories(): string[] {
    const categories = new Set<string>()
    for (const component of Object.values(this.raw.components)) {
      categories.add(component.category)
    }
    return Array.from(categories).sort()
  }

  /** Returns the token definition for a name. */
  getToken(name: string) {
    return this.raw.tokens.find((t) => t.name === name)
  }

  /** The design system's metadata. */
  get designSystem() {
    return this.raw.designSystem
  }

  /** The contract version this manifest satisfies. */
  get contractVersion() {
    return this.raw.contractVersion
  }
}

/**
 * Loads a manifest from a plain object. Validates against the schema and
 * throws on any error.
 */
export function loadManifest(input: unknown): LoadedManifest {
  const result = ManifestSchema.safeParse(input)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid manifest:\n${issues}`)
  }
  return new LoadedManifest(result.data)
}

/**
 * Loads a manifest from a remote URL. Used when design systems serve their
 * manifest via HTTP rather than bundling it into the consumer.
 */
export async function loadManifestFromUrl(url: string, init?: RequestInit): Promise<LoadedManifest> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`Failed to fetch manifest from ${url}: HTTP ${response.status}`)
  }
  const json = (await response.json()) as unknown
  return loadManifest(json)
}
```

### C2.5 — Build the lint rules

`src/lint.ts`:

```typescript
import type { Manifest } from './manifest'
import type { ComponentContract } from './schema'

export interface LintIssue {
  severity: 'error' | 'warning'
  component: string
  rule: string
  message: string
}

export interface LintOptions {
  /**
   * An optional source of truth for Storybook story IDs. If provided, lint
   * will verify every example's storyId exists in this set.
   */
  availableStoryIds?: Set<string>
  /**
   * An optional set of valid token names. If provided, lint will verify
   * every consumed token exists in this set.
   */
  availableTokens?: Set<string>
}

/**
 * Lints a manifest against the contract's internal consistency rules.
 * Returns an array of issues. Empty array means the manifest is clean.
 */
export function lintManifest(manifest: Manifest, options: LintOptions = {}): LintIssue[] {
  const issues: LintIssue[] = []
  const componentNames = new Set(Object.keys(manifest.components))
  const tokenNames = options.availableTokens ?? new Set(manifest.tokens.map((t) => t.name))
  const storyIds = options.availableStoryIds

  for (const [name, component] of Object.entries(manifest.components)) {
    // Check requiredSiblings and forbiddenAdjacent reference real components
    for (const sibling of component.composition.requiredSiblings) {
      if (!componentNames.has(sibling)) {
        issues.push({
          severity: 'error',
          component: name,
          rule: 'composition.requiredSiblings',
          message: `References unknown component "${sibling}"`,
        })
      }
    }

    for (const adjacent of component.composition.forbiddenAdjacent) {
      if (!componentNames.has(adjacent)) {
        issues.push({
          severity: 'error',
          component: name,
          rule: 'composition.forbiddenAdjacent',
          message: `References unknown component "${adjacent}"`,
        })
      }
    }

    // Check token references
    for (const token of component.tokens.consumes) {
      if (!tokenNames.has(token)) {
        issues.push({
          severity: 'error',
          component: name,
          rule: 'tokens.consumes',
          message: `References unknown token "${token}"`,
        })
      }
    }

    // Check story IDs if we have a source of truth
    if (storyIds) {
      for (const example of component.examples) {
        if (!storyIds.has(example.storyId)) {
          issues.push({
            severity: 'error',
            component: name,
            rule: 'examples.storyId',
            message: `Example "${example.label}" references unknown story "${example.storyId}"`,
          })
        }
      }
    }

    // Warnings
    if (component.antiExamples.length === 0) {
      issues.push({
        severity: 'warning',
        component: name,
        rule: 'antiExamples.empty',
        message: 'Component has no anti-examples; consider adding at least one',
      })
    }

    if (component.intent.length < 50) {
      issues.push({
        severity: 'warning',
        component: name,
        rule: 'intent.brevity',
        message: 'Intent statement is quite short; consider a more specific description',
      })
    }
  }

  return issues
}

/**
 * Formats lint issues as a readable string for CI output.
 */
export function formatLintIssues(issues: LintIssue[]): string {
  if (issues.length === 0) return 'No issues found.'

  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  const lines: string[] = []

  if (errors.length > 0) {
    lines.push(`\nErrors (${errors.length}):`)
    for (const issue of errors) {
      lines.push(`  [${issue.component}] ${issue.rule}: ${issue.message}`)
    }
  }

  if (warnings.length > 0) {
    lines.push(`\nWarnings (${warnings.length}):`)
    for (const issue of warnings) {
      lines.push(`  [${issue.component}] ${issue.rule}: ${issue.message}`)
    }
  }

  return lines.join('\n')
}

/**
 * Throws if the manifest has any errors. Warnings do not throw.
 */
export function assertManifestClean(manifest: Manifest, options?: LintOptions): void {
  const issues = lintManifest(manifest, options)
  const errors = issues.filter((i) => i.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Manifest has errors:\n${formatLintIssues(errors)}`)
  }
}
```

### C2.6 — Build the index exports

`src/index.ts`:

```typescript
export * from './schema'
export * from './manifest'
export * from './loader'
export type { LintIssue, LintOptions } from './lint'
```

Note: lint functions (`lintManifest`, etc.) are NOT re-exported from the main index. They're available via the `./lint` subpath. This keeps the main entry light for apps that only need runtime loading.

### C2.7 — Write comprehensive tests

`src/schema.test.ts` — test the schema:

```typescript
import { describe, it, expect } from 'vitest'
import { ComponentContractSchema } from './schema'

describe('ComponentContractSchema', () => {
  it('validates a complete contract', () => {
    const contract = {
      name: 'Hero',
      category: 'hero',
      description: 'A page opener component with headline and optional call-to-action.',
      intent: 'Used to establish what a page is about within the first viewport. Appropriate for top-level pages that need editorial framing.',
      composition: {
        placement: ['page'],
        maxPerPage: 1,
        requiredSiblings: [],
        forbiddenAdjacent: ['Hero'],
      },
      content: {
        fields: [
          { name: 'headline', type: 'text', required: true, maxLength: 80 },
        ],
      },
      tokens: {
        consumes: ['color.brand.primary'],
      },
      accessibility: {
        role: 'banner',
        screenReaderBehavior: 'Headline is announced as h1 by default.',
      },
      examples: [
        { label: 'Default', intent: 'Standard page opener', storyId: 'hero--default' },
      ],
    }

    const result = ComponentContractSchema.safeParse(contract)
    expect(result.success).toBe(true)
  })

  it('rejects non-PascalCase names', () => {
    const result = ComponentContractSchema.safeParse({ name: 'hero', /* ... */ })
    expect(result.success).toBe(false)
  })

  it('requires at least one example', () => {
    // ...
  })

  it('requires screenReaderBehavior of reasonable length', () => {
    // ...
  })
})
```

`src/manifest.test.ts`, `src/loader.test.ts`, `src/lint.test.ts` — comprehensive test coverage. Test cases to include:

- Valid manifest loads cleanly
- Invalid manifest throws with readable error messages
- LoadedManifest methods return correct results
- Lint catches dangling component references
- Lint catches dangling token references
- Lint's story ID validation works when `availableStoryIds` is provided
- Lint skips story ID validation when not provided
- `assertManifestClean` throws on errors, passes on warnings-only

Aim for 90%+ coverage on this package — it's the foundation everything else rests on.

### C2.8 — Write the README

`README.md`:

```markdown
# @forumone/claude-cms-design-contract

The contract every AI-ready design system satisfies to be consumable by the Claude-First CMS.

## What this package provides

- **ComponentContractSchema** — the Zod schema for per-component metadata (intent, composition rules, content fields, tokens, accessibility, examples)
- **ManifestSchema** — the aggregated JSON format a design system publishes
- **loadManifest / loadManifestFromUrl** — runtime loaders with strict validation
- **lintManifest** (via `/lint` subpath) — CI-runnable consistency checks for design system repos

## Installation

```bash
pnpm add @forumone/claude-cms-design-contract
```

## Authoring contracts in a design system

Each component in your design system has a co-located contract file:

```
src/components/Hero/
├── Hero.tsx
├── Hero.stories.tsx
├── Hero.contract.ts
└── index.ts
```

The contract file exports a single object that satisfies `ComponentContract`:

```typescript
import type { ComponentContract } from '@forumone/claude-cms-design-contract'

export const contract: ComponentContract = {
  name: 'Hero',
  category: 'hero',
  // ...
}
```

Your build tooling aggregates these into a manifest — see the reference design system (`@forumone/claude-cms-reference-ds`) for an example build script.

## Loading a manifest at runtime

```typescript
import { loadManifest } from '@forumone/claude-cms-design-contract'
import manifest from '@my-company/design-system/manifest.json'

const loaded = loadManifest(manifest)
const hero = loaded.requireComponent('Hero')
console.log(hero.intent)
```

## Linting in CI

```typescript
import { lintManifest, formatLintIssues } from '@forumone/claude-cms-design-contract/lint'
import manifest from './dist/manifest.json'

const issues = lintManifest(manifest, {
  availableStoryIds: new Set(/* ... */),
})

if (issues.some((i) => i.severity === 'error')) {
  console.error(formatLintIssues(issues))
  process.exit(1)
}
```

## Versioning

The current contract version is `1.0.0`. Manifests declare which version they satisfy via the `contractVersion` field. The loader enforces version match.

When the contract evolves, this package ships a new major version and provides migration guidance in the changelog.

## Related packages

- `@forumone/claude-cms-reference-ds` — a reference design system that satisfies this contract
- `@forumone/claude-cms-components` — the Component Server MCP that consumes manifests
- `@forumone/claude-cms` — the framework these compose into
```

### C2.9 — Add a changeset for initial release

```bash
pnpm changeset
```

Select `@forumone/claude-cms-design-contract`, choose `minor` (0.1.0 is the first published version, and we want semantic versioning to start cleanly), and write:

> Initial release. Defines `ComponentContractSchema`, `ManifestSchema`, `loadManifest`, and `lintManifest`. Every design system that satisfies this contract is a valid input to the framework's Component Server.

Commit the changeset.

### C2.10 — Verify end-to-end

Run from the repo root:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

All should pass. The design-contract package should build to `packages/design-contract/dist/` with `.js`, `.d.ts`, and source maps.

Open a PR, merge to main, verify the release PR opens and includes design-contract.

## Acceptance criteria

- [ ] `packages/design-contract/` exists with proper scaffolding (package.json, tsconfig, src, tests)
- [ ] `ComponentContractSchema` is a complete Zod schema matching the original Phase 04 design
- [ ] `ManifestSchema` defines the aggregated JSON format with contract versioning
- [ ] `LoadedManifest` class provides `getComponent`, `requireComponent`, `listComponents`, `listByCategory`, `listCategories`, `getToken`
- [ ] `loadManifest` validates and returns LoadedManifest; throws on invalid input
- [ ] `loadManifestFromUrl` fetches and validates a remote manifest
- [ ] `lintManifest` reports errors and warnings for inconsistent contracts
- [ ] `formatLintIssues` and `assertManifestClean` helpers work
- [ ] Main entry exports schema + loader; `/lint` subpath exports lint helpers
- [ ] Test coverage on the package is 90%+
- [ ] README explains authoring, loading, and linting
- [ ] Changeset exists; package ready to publish as 0.1.0

## Notes for Claude Code

- This package is load-bearing. Test coverage matters more here than anywhere else. Invest in tests.
- The schema choices here become permanent-ish. Changing the schema later means every consumer has to update. If something feels uncertain, err on the side of requiring it (stricter is easier to loosen than loosen is to tighten).
- The `CONTRACT_VERSION` literal in the schema is a deliberate choice. It forces every manifest to match our version exactly. When we later ship a 2.0 schema, the loader will reject 1.0 manifests with a clear error rather than silently accepting incomplete data.
- Do not include runtime loading of design systems (e.g., from disk paths) in this package. It's a contract + validator. The reference DS (C3) and client design systems handle their own build tooling.
- The lint rules (C2.5) are exported as pure functions, not as a CLI. Design systems integrate lint into their own CI however they prefer. A CLI might come later but would be a separate package.
- If TypeScript struggles with the recursive `ContentFieldSchema`, the `z.lazy()` approach with the explicit `z.ZodType` annotation is the standard workaround. Don't try to make it elegant — make it work.
- Keep the main entry light. Do not export test utilities, dev tools, or verbose helpers from the main index. Subpath exports exist for a reason.
- Commit after each major task (C2.2, C2.4, C2.5, C2.7). If tests reveal a schema flaw late, it's cheaper to fix and commit incrementally than to rewrite a monolithic commit.

## What's next

Phase C3 builds the reference design system — `@forumone/claude-cms-reference-ds` — with 10-12 components that satisfy the contract defined here. It serves three roles: test fixture for core development, demo for showing what a compliant DS looks like, and starting template for client projects without their own DS. After C3, we have a working DS to build the Component Server (C5) against.

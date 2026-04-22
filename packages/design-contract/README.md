# @forumone/throughline-design-contract

The contract every AI-ready design system satisfies to be consumable by Throughline.

## What this package provides

- **`ComponentContractSchema`** — the Zod schema for per-component metadata (intent, composition rules, content fields, tokens, accessibility, examples).
- **`ManifestSchema`** — the aggregated JSON format a design system publishes, versioned via `contractVersion`.
- **`loadManifest` / `loadManifestFromUrl`** — runtime loaders with strict validation and a readable error format.
- **`lintManifest`** (via the `/lint` subpath) — CI-runnable consistency checks for design system repos.

Zero runtime dependencies beyond Zod. Safe to import into client apps, design systems, and server packages alike.

## Installation

```bash
pnpm add @forumone/throughline-design-contract
```

## Authoring contracts in a design system

Each component has a co-located contract file:

```
src/components/Hero/
├── Hero.tsx
├── Hero.stories.tsx
├── Hero.contract.ts
└── index.ts
```

`Hero.contract.ts` exports a single object that satisfies `ComponentContract`:

```typescript
import type { ComponentContract } from '@forumone/throughline-design-contract'

export const contract: ComponentContract = {
  name: 'Hero',
  category: 'hero',
  description: 'A page opener with a headline and optional call-to-action.',
  intent:
    'Used to establish what a page is about within the first viewport. Appropriate for top-level pages that need editorial framing.',
  composition: {
    placement: ['page'],
    maxPerPage: 1,
    requiredSiblings: [],
    forbiddenAdjacent: ['Hero'],
  },
  content: {
    fields: [{ name: 'headline', type: 'text', required: true, maxLength: 80 }],
  },
  tokens: { consumes: ['color.brand.primary'] },
  accessibility: {
    keyboardSupport: [],
    screenReaderBehavior: 'Headline is announced as h1 by default.',
    contentWarnings: [],
  },
  examples: [{ label: 'Default', intent: 'Standard page opener', storyId: 'hero--default' }],
  antiExamples: [
    { label: 'Stacked heroes', why: 'Breaks the visual rhythm.', useInstead: 'Section' },
  ],
}
```

Your design system's build tooling aggregates these into a `Manifest`. See the reference design system for a canonical example.

## Loading a manifest at runtime

```typescript
import { loadManifest } from '@forumone/throughline-design-contract'
import manifest from '@my-company/design-system/manifest.json'

const loaded = loadManifest(manifest)

const hero = loaded.requireComponent('Hero')
console.log(hero.intent)

for (const name of loaded.listByCategory('card')) {
  console.log(name)
}
```

Invalid manifests throw immediately with a path-qualified error message. The loader never partially loads invalid data.

### Loading over HTTP

```typescript
import { loadManifestFromUrl } from '@forumone/throughline-design-contract'

const loaded = await loadManifestFromUrl('https://ds.example.com/manifest.json')
```

## Linting in CI

Every design system should lint its own manifest before publishing. Import the lint helpers from the `/lint` subpath:

```typescript
import { lintManifest, formatLintIssues } from '@forumone/throughline-design-contract/lint'
import manifest from './dist/manifest.json'

const issues = lintManifest(manifest, {
  availableStoryIds: new Set(/* collected from storybook-static */),
})

if (issues.some((i) => i.severity === 'error')) {
  console.error(formatLintIssues(issues))
  process.exit(1)
}
```

`lintManifest` checks:

- Every `requiredSiblings` and `forbiddenAdjacent` entry references a real component in the manifest.
- Every token in `tokens.consumes` exists in the manifest's token table (or in `availableTokens` if you pass one).
- Every example's `storyId` exists in `availableStoryIds` (skipped when the option is omitted).
- Warnings: components with no anti-examples; intent statements shorter than 50 characters.

`assertManifestClean(manifest, options)` is the CI-friendly form: throws on any error, silent on warnings-only.

## Versioning

The current contract version is `1.0.0`, exported as `CONTRACT_VERSION`. Manifests declare it via the `contractVersion` field; the loader rejects mismatches so Claude never recommends a component from a schema it does not understand.

When the contract evolves, this package ships a new major version with migration guidance in the changelog.

## Relationship to Storybook AI manifests

Storybook ships its own [AI manifest format](https://storybook.js.org/docs/ai/manifests) (`/manifests/components.json`). It is a static-analysis artifact that describes what *exists* in a Storybook — component ids, paths, props with types and JSDoc, story ids, import statements. Storybook marks it as preview / unstable.

This package's contract describes what's *appropriate* — intent, composition rules, accessibility expectations, anti-examples, token consumption. Hand-authored, stable, versioned.

They complement rather than overlap. Typical integration: during a design system's CI, parse Storybook's `components.json`, collect every `stories[].id`, and pass the set to `lintManifest` as `availableStoryIds`. That gives you the "does this `storyId` resolve to a real story?" check for free:

```typescript
import storybookManifest from './storybook-static/manifests/components.json'
import contractManifest from './dist/manifest.json'
import { lintManifest } from '@forumone/throughline-design-contract/lint'

const availableStoryIds = new Set(
  Object.values(storybookManifest.components).flatMap((c: { stories: Array<{ id: string }> }) =>
    c.stories.map((s) => s.id),
  ),
)

const issues = lintManifest(contractManifest, { availableStoryIds })
```

## Related packages

- `@forumone/throughline-reference-ds` — a reference design system that satisfies this contract (C3).
- `@forumone/throughline-components` — the Component Server MCP that consumes manifests (C5).
- `@forumone/throughline-plugin-contract` — the plugin contract for packages that extend Payload.

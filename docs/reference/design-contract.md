# @forumone/throughline-design-contract

The contract every Throughline-compatible design system satisfies. Defines the schema for component manifests, the lint rules that validate them, and the loaders that read them at runtime.

## Install

```bash
pnpm add @forumone/throughline-design-contract
```

No peer dependencies; this package is data + validation only.

## Public API

```typescript
import {
  ComponentContractSchema,
  ManifestSchema,
  CONTRACT_VERSION,
  lintManifest,
  formatLintIssues,
  loadManifest,
} from '@forumone/throughline-design-contract'
```

## Types

```typescript
import type {
  ComponentContract,
  Manifest,
  TokenList,
  LintIssue,
  LintResult,
} from '@forumone/throughline-design-contract'
```

### `ComponentContract`

```typescript
interface ComponentContract {
  name: string                    // unique within the manifest
  description: string
  categories: string[]
  intents: string[]
  storyId?: string                // links to Storybook story
  props: ZodSchema | JsonSchema   // see "Schema flexibility" below
  slots?: Record<string, SlotConstraint>
  tokens?: string[]
  examples?: ComponentExample[]
  antiExamples?: ComponentAntiExample[]
}
```

For full prose on each field, see [Authoring component contracts](../guides/authoring-component-contracts.md).

### `Manifest`

```typescript
interface Manifest {
  contractVersion: string         // matches CONTRACT_VERSION
  designSystem: {
    name: string
    version: string
    homepage?: string
  }
  tokens: TokenList               // brand tokens declared by the DS
  components: ComponentContract[]
}
```

A manifest is a single JSON object describing a complete design system. Generated at DS build time from per-component `.contract.ts` files.

### `LintIssue`

```typescript
interface LintIssue {
  level: 'error' | 'warn'
  componentName?: string
  field?: string
  message: string
  details?: Record<string, unknown>
}
```

What `lintManifest` returns. `error`-level issues fail validation; `warn`-level issues are reported but pass.

## Functions

### `lintManifest(manifest, options): LintResult`

```typescript
const result = lintManifest(manifest, {
  storybookIndex,    // optional: storybook-static/index.json contents
})

if (!result.ok) {
  console.error(formatLintIssues(result.issues))
  process.exit(1)
}
```

Validates a manifest against the contract:

- Schema correctness (every component has required fields)
- Story IDs (if `storybookIndex` is provided, every `storyId` must resolve)
- Token references (components' `tokens` arrays only reference tokens declared in the manifest's `tokens` list)
- Example / anti-example shape (must validate against the component's prop schema)

Returns `{ ok, issues }`. The reference DS's `validate` script runs this in CI.

### `formatLintIssues(issues): string`

Pretty-prints lint issues for terminal output. Used by every DS's validate script.

### `loadManifest(source): Promise<Manifest>`

```typescript
import { loadManifest } from '@forumone/throughline-design-contract'

const manifest = await loadManifest({ type: 'url', url: 'https://ds.example.com/manifest.json' })
// or
const manifest = await loadManifest({ type: 'object', manifest: localManifest })
// or
const manifest = await loadManifest({ type: 'file', path: './manifest.json' })
```

Reads a manifest from one of three sources. Validates with `lintManifest` along the way; throws on errors. The Components plugin uses this internally; you generally don't need to call it.

## Schema flexibility

`ComponentContract.props` accepts a Zod schema, a JSON Schema object, or a structured serialized form. The reference DS uses Zod via `.contract.ts` files; the Components plugin's runtime supports any of the three for cross-language design systems.

## CONTRACT_VERSION

```typescript
import { CONTRACT_VERSION } from '@forumone/throughline-design-contract'
// "0.1.0"
```

Manifest schema version. Manifests with a `contractVersion` mismatching this string fail validation. Bumped on breaking changes to the contract shape.

## Common usage

### From a DS package's build

```typescript
// scripts/build-manifest.ts
import { writeFile } from 'node:fs/promises'
import { CONTRACT_VERSION, lintManifest, formatLintIssues } from '@forumone/throughline-design-contract'
import { allTokens, getTokenList } from '../src/tokens'
import { heroContract, sectionIntroContract /*, ... */ } from '../src/components'

const manifest = {
  contractVersion: CONTRACT_VERSION,
  designSystem: { name: 'Reference DS', version: '0.1.0' },
  tokens: getTokenList(allTokens),
  components: [heroContract, sectionIntroContract /*, ... */],
}

const result = lintManifest(manifest)
if (!result.ok) {
  console.error(formatLintIssues(result.issues))
  process.exit(1)
}

await writeFile('./dist/manifest.json', JSON.stringify(manifest, null, 2))
```

### From a Throughline app's Payload config

```typescript
import { componentsPlugin } from '@forumone/throughline-components'
import myDsManifest from '@my-scope/design-system/manifest' with { type: 'json' }

componentsPlugin({
  manifest: { type: 'object', manifest: myDsManifest },
}),
```

The Components plugin loads the manifest and validates it on startup.

## Related

- Concept: [Design system contracts](../concepts/design-system-contracts.md) — the full prose explanation
- Guide: [Authoring component contracts](../guides/authoring-component-contracts.md) — practical authoring
- Reference: [@forumone/throughline-reference-ds](reference-ds.md) — example consumer
- Reference: [@forumone/throughline-components](components.md) — the runtime that uses the contract

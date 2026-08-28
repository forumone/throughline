# @forumone/throughline-components

MCP server that exposes a design system manifest as conversational primitives. Drop it into a Payload + Throughline app and Claude can list components, read contracts, suggest components for an intent, validate compositions, and surface anti-patterns — against any design system that satisfies the Throughline contract.

## What this package provides

Seven MCP tools, handed to the host's collector at `onInit` and served by
`@payloadcms/plugin-mcp` on one `/api/mcp`. Pass `mcpTools` or they reach nobody.
This plugin serves no HTTP endpoint of its own, and so takes no `routePrefix`.

| Tool | Purpose |
|---|---|
| `list_components` | Discover what components exist (optionally filtered by category) |
| `get_contract` | Full `ComponentContract` for a named component |
| `get_variants` | Available variants and when to use each |
| `get_tokens` | Tokens a component consumes + configurable token-backed props |
| `suggest_for_intent` | Ranked component recommendations for a natural-language intent |
| `validate_composition` | Errors + warnings for a proposed block list against the design system's rules |
| `find_anti_pattern` | Surfaces structural anti-patterns (multiple Heroes, Hero at the bottom, etc.) |

Every consequential call writes to the audit log via `@forumone/throughline-core`'s audit writer.

## Installation

```bash
pnpm add @forumone/throughline-components
```

Peer: `payload@^3.0.0`. Required runtime: `@forumone/throughline-core` (the components plugin asserts the `audit-log` capability at init).

## Usage

```ts
import { buildConfig } from 'payload'
import { auditPlugin, createInngestClient } from '@forumone/throughline-core'
import { componentsPlugin } from '@forumone/throughline-components'
import manifest from '@my-company/design-system/manifest' with { type: 'json' }

const inngest = createInngestClient({ id: 'my-site' })

export default buildConfig({
  // collections, db, secret...
  plugins: [
    auditPlugin({ inngest }),       // must come first (componentsPlugin requires audit-log)
    componentsPlugin({
      manifest: { type: 'object', manifest },
      matching: { strategy: 'tfidf' },
    }),
  ],
})
```

## Manifest sources

Three ways to supply the manifest:

**Imported object** — simplest; bundle the manifest with the app.

```ts
componentsPlugin({ manifest: { type: 'object', manifest: importedManifest } })
```

**Remote URL** — for design systems deployed independently.

```ts
componentsPlugin({
  manifest: {
    type: 'url',
    url: 'https://design-system.example.com/manifest.json',
    refreshInterval: 3600, // seconds; manifest is re-fetched after the TTL expires
  },
})
```

**Payload collection** — when the manifest is admin-editable.

```ts
componentsPlugin({
  manifest: { type: 'payload-collection', slug: 'design-system-manifest' },
})
```

The loader reads the most recent document by `updatedAt`, optionally filtered by `documentId`, and looks for a `data` field on it before falling back to the document itself.

## Intent matching

The current shipping strategy is **TF-IDF**: zero external dependencies, weights `intent` more than `description`, fast enough that the first response after deploy is sub-100ms.

```ts
componentsPlugin({
  manifest: { /* ... */ },
  matching: { strategy: 'tfidf', maxRecommendations: 5 },
})
```

An embeddings-based matcher is on the roadmap. The matcher interface is strategy-agnostic, so swapping it in won't change the tool surface. Until then, real recommendation quality depends on contract authoring — specifically, on how vividly each `intent` field describes the component's editorial purpose.

## Composition rules enforced

`validate_composition` checks:

- **`forbiddenAdjacent`** — neither the previous nor next block can be the forbidden type
- **`maxPerPage`** — total occurrences in the block list don't exceed the contract's `maxPerPage`
- **`requiredSiblings`** — warns (not errors) when a sibling that the contract expects isn't present
- **Unknown components** — flagged as an error
- **Unknown variants** — flagged as an error per block

`find_anti_pattern` surfaces:

- "Multiple X" labels when X appears more than once in the block list
- "End of page" / "bottom" labels when an X with `placement: ['page']` lands as the last block

The two tools are complementary. Use `validate_composition` to gate publishing and `find_anti_pattern` to surface design quality issues that aren't strictly invalid.

## The `_meta` parameter

`suggest_for_intent`, `validate_composition`, and `find_anti_pattern` all accept the framework's `_meta` payload (via `withMeta` from `@forumone/throughline-core`):

```jsonc
{
  "intent": "introduce a new climate fellowship",
  "_meta": {
    "userPrompt": "I want a hero for the new climate program",
    "reasoning": "The marketer asked for a page opener, not a section header",
    "changesSummary": "Recommended Hero (split variant) for the program landing"
  }
}
```

The audit writer reads these fields and stores them on every record so "why did Claude recommend Hero for the contact page?" is answerable later.

## Related packages

- `@forumone/throughline-design-contract` — the manifest schema this plugin reads
- `@forumone/throughline-reference-ds` — reference DS used as a test fixture and a starting point for clients
- `@forumone/throughline-core` — required peer; provides the audit log, MCP handler, and `withMeta` helper this plugin builds on

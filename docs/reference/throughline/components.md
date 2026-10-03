# Components: `@forumone/throughline/components`

This was `/components` in 0.x; [`docs/spec/1.0-exports.md`](../../spec/1.0-exports.md) maps its imports.

MCP server that exposes a design system manifest as conversational primitives. Drop it into a Payload + Throughline app and Claude can list components, read contracts, suggest components for an intent, validate compositions, and surface anti-patterns — against any design system that satisfies the Throughline contract.

## What this package provides

Seven MCP tools, handed to the host's collector at `onInit` and served by
`@payloadcms/plugin-mcp` on one `/api/mcp`. Pass `mcpTools` or they reach nobody.
This plugin serves no HTTP endpoint of its own, and so takes no `routePrefix`.

| Tool                   | Purpose                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `list_components`      | Discover what components exist (optionally filtered by category)              |
| `get_contract`         | Full `ComponentContract` for a named component                                |
| `get_variants`         | Available variants and when to use each                                       |
| `get_tokens`           | Tokens a component consumes + configurable token-backed props                 |
| `suggest_for_intent`   | Ranked component recommendations for a natural-language intent                |
| `validate_composition` | Errors + warnings for a proposed block list against the design system's rules |
| `find_anti_pattern`    | Surfaces structural anti-patterns (multiple Heroes, Hero at the bottom, etc.) |

Every consequential call writes to the audit log via `@forumone/throughline`'s audit writer.

## Installation

Part of [`@forumone/throughline`](../throughline.md#installation), which lists the optional peers each subpath needs. `throughline({ components: { … } })` registers it, after the audit log; registered by hand, it needs `auditPlugin` from `/audit` first. The plugin asserts the `audit-log` capability at init.

## Usage

```ts
import manifest from '@my-company/design-system/manifest' with { type: 'json' }

export const suite = throughline({
  jobs: inngestJobs(inngest),
  collections: ['pages'],
  components: {
    manifest: { type: 'object', manifest },
    matching: { strategy: 'tfidf' },
  },
})
```

Registered by hand instead, it goes after `auditPlugin`, which it requires, and takes `mcpTools` itself. The snippets below show the `components` key.

## Manifest sources

Three ways to supply the manifest:

**Imported object** — simplest; bundle the manifest with the app.

```ts
components: { manifest: { type: 'object', manifest: importedManifest } }
```

**Remote URL** — for design systems deployed independently.

```ts
components: {
  manifest: {
    type: 'url',
    url: 'https://design-system.example.com/manifest.json',
    refreshInterval: 3600, // seconds; manifest is re-fetched after the TTL expires
  },
}
```

**Payload collection** — when the manifest is admin-editable.

```ts
components: {
  manifest: { type: 'payload-collection', slug: 'design-system-manifest' },
}
```

The loader reads the most recent document by `updatedAt`, optionally filtered by `documentId`, and looks for a `data` field on it before falling back to the document itself.

## Intent matching

The current shipping strategy is **TF-IDF**: zero external dependencies, weights `intent` more than `description`, fast enough that the first response after deploy is sub-100ms.

```ts
components: {
  manifest: {/* ... */},
  matching: { strategy: 'tfidf', maxRecommendations: 5 },
}
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

`suggest_for_intent`, `validate_composition`, and `find_anti_pattern` all accept the framework's `_meta` payload (via `withMeta` from `@forumone/throughline`):

```jsonc
{
  "intent": "introduce a new climate fellowship",
  "_meta": {
    "userPrompt": "I want a hero for the new climate program",
    "reasoning": "The marketer asked for a page opener, not a section header",
    "changesSummary": "Recommended Hero (split variant) for the program landing",
  },
}
```

The audit writer reads these fields and stores them on every record so "why did Claude recommend Hero for the contact page?" is answerable later.

## Related

- [`/contract`](../design-system/contract.md) in `@forumone/throughline-design-system`: the manifest schema this plugin reads
- [`@forumone/create-throughline`](../create-throughline.md): its reference design system is this plugin's test fixture, and a new project's starting point
- [`@forumone/throughline`](../throughline.md): the audit log and `withMeta`

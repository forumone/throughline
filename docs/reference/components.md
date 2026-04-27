# @forumone/throughline-components

The Components MCP server. Reads a design-system manifest, exposes it to Claude as conversational tools, validates compositions against the manifest's rules. The "what to draft" surface of the framework.

## Install

```bash
pnpm add @forumone/throughline-components @forumone/throughline-design-contract
```

Peer dependencies: `payload@^3.0.0`. Workspace depends on `@forumone/throughline-core` and `@forumone/throughline-design-contract`.

## Public API

```typescript
import { componentsPlugin } from '@forumone/throughline-components'
import type {
  ComponentsPluginOptions,
  ManifestSource,
  MatchingConfig,
} from '@forumone/throughline-components'
```

## `componentsPlugin(options)`

```typescript
componentsPlugin({
  manifest: { type: 'object', manifest } | { type: 'url', url: string } | { type: 'file', path: string },
  matching?: { strategy: 'tfidf' } | { strategy: 'voyage', model?: string, apiKeyEnv?: string },
  brand?: {
    tokens?: Record<string, string>      // override CSS-variable values
    additions?: ComponentContract[]      // append client-specific components
  },
  routePrefix?: string,                   // default '/components'
})
```

`manifest`:
- `{ type: 'object', manifest }` — pre-loaded JSON; the most common case
- `{ type: 'url', url }` — fetched at startup; cached per-process
- `{ type: 'file', path }` — read from disk; useful for local DS development

`matching`:
- `tfidf` — default, no API key required, fast and reasonable
- `voyage` — embedding-based matching via Voyage AI; higher quality. Requires `VOYAGE_API_KEY` env var (override env var name with `apiKeyEnv`)

`brand`:
- `tokens` — replace token values; the manifest doesn't change, but Claude sees the updated values when reasoning about theming
- `additions` — append custom components to the manifest's `components` array. Useful when you want to extend the reference DS with one-off project-specific components without forking

## MCP tools

The plugin registers an MCP server at `/api/components/mcp`. Tools:

| Tool | Required role | Purpose |
| --- | --- | --- |
| `list_components` | any | Returns every component contract in the manifest |
| `propose_components` | `editor`, `admin` | Returns ranked candidates given an intent (free-text) |
| `validate_composition` | any | Validates a layout (a tree of components + props + slots) against the contract |
| `get_component` | any | Returns one component contract by name |
| `get_brand_tokens` | any | Returns the resolved token values |

Tool input/output schemas are in `packages/components/src/tools/`. The `validate_composition` tool is what stage 2 of the publish pipeline calls — see [The trust boundary](../concepts/the-trust-boundary.md).

## Capabilities registered

- `components` — the package is loaded
- `composition-validator` — `validate_composition` is available

The Publishing plugin's `requireCapability('composition-validator', ...)` check fails to boot if Components isn't loaded first.

## Matching strategies

### TF-IDF

Default. Tokenizes intents + descriptions + categories from the manifest, computes TF-IDF vectors, and ranks candidates by cosine similarity to the query intent. No external service; works offline.

Tradeoffs: misses paraphrases and semantic relationships ("show some numbers" doesn't match the Stats component's "display statistics" because shared tokens are weak).

### Voyage embeddings

Higher quality. Embeds intents and descriptions via Voyage AI; ranks by cosine similarity in the embedding space. Cached per-component on first computation, so subsequent matches don't re-embed.

Set `VOYAGE_API_KEY` and:

```typescript
componentsPlugin({
  manifest: { /* ... */ },
  matching: { strategy: 'voyage', model: 'voyage-3-lite' },
})
```

The default model is fast and inexpensive; `voyage-3-large` is more accurate at ~3x the cost.

## Common usage

```typescript
import { componentsPlugin } from '@forumone/throughline-components'
import manifest from '@your-scope/design-system/manifest' with { type: 'json' }

componentsPlugin({
  manifest: { type: 'object', manifest },
  matching: { strategy: 'tfidf' },
  brand: {
    tokens: {
      'color.brand.primary': '#0a4d8a',
    },
  },
}),
```

## Related

- Concept: [Design system contracts](../concepts/design-system-contracts.md)
- Concept: [The trust boundary](../concepts/the-trust-boundary.md) — composition validation runs as stage 2 of publishing
- Guide: [Authoring component contracts](../guides/authoring-component-contracts.md)
- Reference: [@forumone/throughline-design-contract](design-contract.md), [@forumone/throughline-reference-ds](reference-ds.md)

# Phase C5 — Component Server

## Goal

Build `@forumone/claude-cms-components` — the first custom MCP server in the framework. Exposes a design system manifest as conversational primitives: list components, get contracts, suggest components for an intent, validate compositions, detect anti-patterns. Takes the manifest URL or import as config, so it works with any contract-compliant design system (reference DS for testing, Forum One ADS in F2, future clients' DSes without modification).

## Prerequisites

- C2 complete; design contract package published
- C3 complete; reference design system published with generated manifest
- C4 complete; core plumbing package published

## Context

This is the first package that's actually interesting to use. Everything before it was infrastructure; this is the first place where the Claude-First CMS becomes visibly different from a traditional CMS. When a marketer asks "what component should I use to introduce a new program?", the Component Server is what answers.

The package has three conceptual layers:

**Manifest loading.** Client apps point the plugin at a manifest source (an imported JSON, a URL, or a Payload collection). The plugin validates and caches it. Everything downstream reasons against the loaded manifest.

**MCP tool exposure.** Seven tools: `list_components`, `get_contract`, `get_variants`, `get_tokens`, `suggest_for_intent`, `validate_composition`, `find_anti_pattern`. Each is a straightforward read-only operation over the manifest, except `suggest_for_intent` which does real work.

**Intent matching.** Given a natural-language intent and optional composition context, return ranked component recommendations with reasoning. This is where embeddings come in — or, for Phase 1, TF-IDF as a credible starting point.

A few design principles for this phase:

- **Start with TF-IDF, upgrade to embeddings later.** Embeddings require an external API (Voyage AI, OpenAI, Cohere) which means cost, latency, API key management, and failure modes. TF-IDF gets 70% of the value with zero external dependencies. The plugin's config accepts either; clients can start with TF-IDF and swap to embeddings when quality matters.
- **The server reasons; the client composes.** The Component Server answers "what component fits this intent?" and "does this composition pass validation?", but it does not know what's currently on a page. That's Claude's job — Claude reads the page via Payload MCP, asks the Component Server for suggestions, and composes the result.
- **Every call is audited.** Design decisions are consequential — they shape the system's recommendations. The audit log captures every suggestion and every validation so "why did Claude recommend the FAQ component for the contact page?" is answerable later.
- **Config validation is strict.** If the manifest can't be loaded at plugin init, the plugin fails loudly. A broken Component Server doesn't fall back silently to "no recommendations"; it tells the operator something is wrong.

## Tasks

### C5.1 — Scaffold the package

Create `packages/components/`:

```
packages/components/
├── src/
│   ├── plugin.ts
│   ├── options.ts
│   ├── manifest-source.ts
│   ├── tools/
│   │   ├── list-components.ts
│   │   ├── get-contract.ts
│   │   ├── get-variants.ts
│   │   ├── get-tokens.ts
│   │   ├── suggest-for-intent.ts
│   │   ├── validate-composition.ts
│   │   ├── find-anti-pattern.ts
│   │   └── index.ts
│   ├── matching/
│   │   ├── types.ts
│   │   ├── tfidf.ts
│   │   ├── embeddings.ts
│   │   └── index.ts
│   ├── validation/
│   │   └── composition.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── CHANGELOG.md
```

`package.json`:

```json
{
  "name": "@forumone/claude-cms-components",
  "version": "0.1.0",
  "description": "MCP server that exposes a design system manifest as conversational primitives for the Claude-First CMS framework.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
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
  "keywords": ["claude-cms", "design-system", "mcp", "payload"],
  "license": "MIT",
  "peerDependencies": {
    "payload": "^3.0.0"
  },
  "dependencies": {
    "@forumone/claude-cms-core": "workspace:*",
    "@forumone/claude-cms-plugin-contract": "workspace:*",
    "@forumone/claude-cms-design-contract": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-eslint-config": "workspace:*",
    "@forumone/claude-cms-reference-ds": "workspace:*",
    "payload": "^3.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Note the reference DS is a devDependency. It's used for testing but not bundled.

### C5.2 — Define the plugin options

`src/options.ts`:

```typescript
import { z } from 'zod'
import type { BaseCorePluginOptions } from '@forumone/claude-cms-plugin-contract'
import type { Manifest } from '@forumone/claude-cms-design-contract'

export type ManifestSource =
  | { type: 'object'; manifest: Manifest }
  | { type: 'url'; url: string; refreshInterval?: number }
  | { type: 'payload-collection'; slug: string; documentId?: string }

export interface MatchingConfig {
  /**
   * The strategy for intent matching. TF-IDF requires no external dependencies.
   * Embeddings produce better recommendations but require an embedding API.
   */
  strategy: 'tfidf' | 'embeddings'
  /**
   * Required when strategy is 'embeddings'. Configuration for the embedding provider.
   */
  embeddings?: {
    provider: 'voyage' | 'openai' | 'custom'
    apiKey?: string
    model?: string
    baseUrl?: string
  }
  /**
   * Max number of recommendations to return from suggest_for_intent.
   * Default: 5.
   */
  maxRecommendations?: number
}

export interface ComponentsPluginOptions extends BaseCorePluginOptions {
  /**
   * The source of the design system manifest. Required.
   */
  manifest: ManifestSource
  /**
   * Configuration for the intent matching engine.
   */
  matching?: MatchingConfig
}

export const ComponentsPluginOptionsSchema = z.object({
  enabled: z.boolean().optional(),
  routePrefix: z.string().optional(),
  manifest: z.discriminatedUnion('type', [
    z.object({ type: z.literal('object'), manifest: z.unknown() }),
    z.object({
      type: z.literal('url'),
      url: z.string().url(),
      refreshInterval: z.number().int().positive().optional(),
    }),
    z.object({
      type: z.literal('payload-collection'),
      slug: z.string(),
      documentId: z.string().optional(),
    }),
  ]),
  matching: z
    .object({
      strategy: z.enum(['tfidf', 'embeddings']),
      embeddings: z
        .object({
          provider: z.enum(['voyage', 'openai', 'custom']),
          apiKey: z.string().optional(),
          model: z.string().optional(),
          baseUrl: z.string().url().optional(),
        })
        .optional(),
      maxRecommendations: z.number().int().positive().optional(),
    })
    .optional(),
})

export function validateOptions(options: ComponentsPluginOptions): ComponentsPluginOptions {
  const result = ComponentsPluginOptionsSchema.safeParse(options)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid componentsPlugin options:\n${issues}`)
  }

  if (options.matching?.strategy === 'embeddings' && !options.matching.embeddings) {
    throw new Error(
      'Embedding matching strategy selected but no embeddings config provided. Add matching.embeddings to the plugin options.',
    )
  }

  return options
}
```

### C5.3 — Build the manifest source loader

`src/manifest-source.ts`:

```typescript
import {
  loadManifest,
  loadManifestFromUrl,
  type LoadedManifest,
} from '@forumone/claude-cms-design-contract'
import type { Payload } from 'payload'
import type { ManifestSource } from './options'

export interface ManifestLoader {
  get(): Promise<LoadedManifest>
  refresh(): Promise<void>
}

export function createManifestLoader(source: ManifestSource, payload: Payload): ManifestLoader {
  let cached: LoadedManifest | null = null
  let lastLoadedAt = 0

  async function load(): Promise<LoadedManifest> {
    switch (source.type) {
      case 'object':
        return loadManifest(source.manifest)

      case 'url': {
        return loadManifestFromUrl(source.url)
      }

      case 'payload-collection': {
        const query = source.documentId
          ? { id: { equals: source.documentId } }
          : undefined
        const result = await payload.find({
          collection: source.slug,
          where: query,
          limit: 1,
          sort: '-updatedAt',
        })
        const doc = result.docs[0]
        if (!doc) {
          throw new Error(
            `No manifest document found in collection "${source.slug}"${
              source.documentId ? ` with id "${source.documentId}"` : ''
            }`,
          )
        }
        return loadManifest(doc.data ?? doc)
      }
    }
  }

  return {
    async get() {
      if (cached) {
        if (source.type === 'url' && source.refreshInterval) {
          const age = Date.now() - lastLoadedAt
          if (age > source.refreshInterval * 1000) {
            cached = await load()
            lastLoadedAt = Date.now()
          }
        }
        return cached
      }
      cached = await load()
      lastLoadedAt = Date.now()
      return cached
    },
    async refresh() {
      cached = await load()
      lastLoadedAt = Date.now()
    },
  }
}
```

### C5.4 — Build the TF-IDF matcher

`src/matching/types.ts`:

```typescript
import type { ComponentContract } from '@forumone/claude-cms-design-contract'

export interface Matcher {
  rank(query: string, candidates: ComponentContract[]): Array<{ component: ComponentContract; score: number }>
  ready(): Promise<void>
}

export interface RankedSuggestion {
  component: string
  score: number
  reasoning: string
  matchedIntent: string
  variant?: string
  warnings?: string[]
}
```

`src/matching/tfidf.ts`:

```typescript
import type { ComponentContract } from '@forumone/claude-cms-design-contract'
import type { Matcher } from './types'

/**
 * Simple TF-IDF matcher over component search documents. Fast, no external
 * dependencies, good enough to ship and iterate on.
 */
export function createTfidfMatcher(): Matcher {
  let index: Array<{ component: ComponentContract; terms: Map<string, number>; docLength: number }> = []
  let idf: Map<string, number> = new Map()
  let ready = false

  async function buildIndex(components: ComponentContract[]): Promise<void> {
    index = components.map((component) => {
      const document = makeSearchDocument(component)
      const terms = tokenize(document)
      const termFreq = new Map<string, number>()
      for (const term of terms) {
        termFreq.set(term, (termFreq.get(term) ?? 0) + 1)
      }
      return { component, terms: termFreq, docLength: terms.length }
    })

    // Compute IDF
    const docCount = index.length
    const docFreq = new Map<string, number>()
    for (const entry of index) {
      for (const term of entry.terms.keys()) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1)
      }
    }
    idf = new Map()
    for (const [term, df] of docFreq) {
      idf.set(term, Math.log(docCount / df))
    }

    ready = true
  }

  return {
    async ready() {
      // In a real implementation this waits on buildIndex. For simplicity,
      // the rank function just builds index lazily if needed.
    },
    rank(query, candidates) {
      if (!ready || index.length !== candidates.length) {
        // Rebuild if the candidate set changed (shouldn't happen in practice
        // but guards against it).
        void buildIndex(candidates)
      }

      const queryTerms = tokenize(query)
      const queryTermCounts = new Map<string, number>()
      for (const term of queryTerms) {
        queryTermCounts.set(term, (queryTermCounts.get(term) ?? 0) + 1)
      }

      const scored = index.map((entry) => {
        let score = 0
        for (const [term, queryCount] of queryTermCounts) {
          const docCount = entry.terms.get(term) ?? 0
          if (docCount === 0) continue
          const tf = docCount / entry.docLength
          const termIdf = idf.get(term) ?? 0
          score += tf * termIdf * queryCount
        }
        return { component: entry.component, score }
      })

      return scored.sort((a, b) => b.score - a.score)
    },
  }
}

function makeSearchDocument(component: ComponentContract): string {
  const parts: string[] = [
    component.name,
    component.description,
    component.intent,
    ...(component.content.variants ?? []).map((v) => v.whenToUse),
    ...component.examples.map((e) => e.intent),
  ]
  return parts.join(' ')
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'for', 'to', 'of', 'in', 'on', 'at', 'by',
  'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
  'must', 'shall', 'can', 'this', 'that', 'these', 'those', 'it', 'its',
])
```

### C5.5 — Build the embeddings matcher

`src/matching/embeddings.ts`:

```typescript
import type { ComponentContract } from '@forumone/claude-cms-design-contract'
import type { Matcher } from './types'

export interface EmbeddingsConfig {
  provider: 'voyage' | 'openai' | 'custom'
  apiKey?: string
  model?: string
  baseUrl?: string
}

export function createEmbeddingsMatcher(config: EmbeddingsConfig): Matcher {
  let componentEmbeddings: Array<{ component: ComponentContract; embedding: number[] }> = []
  let readyPromise: Promise<void> | null = null

  async function embedMany(texts: string[]): Promise<number[][]> {
    switch (config.provider) {
      case 'voyage':
        return embedVoyage(texts, config)
      case 'openai':
        return embedOpenAi(texts, config)
      case 'custom':
        return embedCustom(texts, config)
    }
  }

  async function buildIndex(components: ComponentContract[]): Promise<void> {
    const texts = components.map(makeSearchDocument)
    const embeddings = await embedMany(texts)
    componentEmbeddings = components.map((component, i) => ({
      component,
      embedding: embeddings[i]!,
    }))
  }

  return {
    async ready() {
      if (readyPromise) return readyPromise
      // The caller provides candidates via rank(); the first call triggers indexing.
      return Promise.resolve()
    },
    rank(query, candidates) {
      if (componentEmbeddings.length !== candidates.length) {
        // Lazy build on first call. In practice the plugin pre-builds at onInit.
        readyPromise = buildIndex(candidates)
      }

      // Synchronous path: if we haven't embedded yet, return unranked.
      // Plugin init should await buildIndex explicitly.
      if (componentEmbeddings.length === 0) {
        return candidates.map((c) => ({ component: c, score: 0 }))
      }

      // For the actual rank operation, we need the query embedding.
      // Because this interface is synchronous, we return a no-op when the
      // query hasn't been embedded yet. The tool handler awaits embedQuery
      // before calling rank.
      return componentEmbeddings.map((entry) => ({
        component: entry.component,
        score: 0, // filled by the tool handler via a separate embedQuery call
      }))
    },
  }
}

async function embedVoyage(texts: string[], config: EmbeddingsConfig): Promise<number[][]> {
  const apiKey = config.apiKey ?? process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error('VOYAGE_API_KEY required for Voyage embeddings')

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: config.model ?? 'voyage-3-lite',
    }),
  })

  if (!response.ok) {
    throw new Error(`Voyage embeddings request failed: HTTP ${response.status}`)
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> }
  return data.data.map((d) => d.embedding)
}

async function embedOpenAi(texts: string[], config: EmbeddingsConfig): Promise<number[][]> {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY required for OpenAI embeddings')

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: config.model ?? 'text-embedding-3-small',
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI embeddings request failed: HTTP ${response.status}`)
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> }
  return data.data.map((d) => d.embedding)
}

async function embedCustom(texts: string[], config: EmbeddingsConfig): Promise<number[][]> {
  if (!config.baseUrl) throw new Error('baseUrl required for custom embedding provider')

  const response = await fetch(`${config.baseUrl}/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: texts, model: config.model }),
  })

  if (!response.ok) {
    throw new Error(`Custom embeddings request failed: HTTP ${response.status}`)
  }

  const data = (await response.json()) as { embeddings: number[][] }
  return data.embeddings
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    magA += a[i]! * a[i]!
    magB += b[i]! * b[i]!
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

function makeSearchDocument(component: ComponentContract): string {
  const parts: string[] = [
    component.description,
    component.intent,
    ...(component.content.variants ?? []).map((v) => `${v.name}: ${v.whenToUse}`),
    ...component.examples.map((e) => e.intent),
  ]
  return parts.join('\n')
}
```

Note: the embeddings matcher as shown has a gap — the synchronous `rank` interface doesn't mesh with async embedding calls for the query. In the actual implementation, the tool handler (`suggestForIntent`) awaits an async `embed(text)` call to get the query embedding, then calls a synchronous scoring function. I've left the interface simple for readability; the handler wires them together. See `C5.8` below for the real integration.

`src/matching/index.ts`:

```typescript
export { createTfidfMatcher } from './tfidf'
export { createEmbeddingsMatcher } from './embeddings'
export type { Matcher, RankedSuggestion } from './types'
export type { EmbeddingsConfig } from './embeddings'
```

### C5.6 — Build composition validation

`src/validation/composition.ts`:

```typescript
import type { LoadedManifest, ComponentContract } from '@forumone/claude-cms-design-contract'

export interface CompositionInput {
  blocks: Array<{ type: string; variant?: string }>
}

export interface CompositionIssue {
  severity: 'error' | 'warning'
  rule: string
  message: string
  blockIndex?: number
  suggestion?: string
}

export interface CompositionResult {
  valid: boolean
  issues: CompositionIssue[]
}

export function validateComposition(input: CompositionInput, manifest: LoadedManifest): CompositionResult {
  const issues: CompositionIssue[] = []
  const countsByType = new Map<string, number>()

  for (let i = 0; i < input.blocks.length; i++) {
    const block = input.blocks[i]!
    countsByType.set(block.type, (countsByType.get(block.type) ?? 0) + 1)

    const contract = manifest.getComponent(block.type)
    if (!contract) {
      issues.push({
        severity: 'error',
        rule: 'unknown-component',
        message: `Unknown component "${block.type}". Not present in the design system.`,
        blockIndex: i,
      })
      continue
    }

    // Verify variant exists if specified
    if (block.variant && contract.content.variants) {
      const variantExists = contract.content.variants.some((v) => v.name === block.variant)
      if (!variantExists) {
        issues.push({
          severity: 'error',
          rule: 'unknown-variant',
          message: `Component "${block.type}" does not have variant "${block.variant}"`,
          blockIndex: i,
        })
      }
    }

    // Check forbiddenAdjacent
    const prev = i > 0 ? input.blocks[i - 1] : null
    const next = i < input.blocks.length - 1 ? input.blocks[i + 1] : null
    for (const forbidden of contract.composition.forbiddenAdjacent) {
      if (prev?.type === forbidden) {
        issues.push({
          severity: 'error',
          rule: 'forbidden-adjacent',
          message: `"${block.type}" cannot appear directly after "${forbidden}"`,
          blockIndex: i,
        })
      }
      if (next?.type === forbidden) {
        issues.push({
          severity: 'error',
          rule: 'forbidden-adjacent',
          message: `"${block.type}" cannot appear directly before "${forbidden}"`,
          blockIndex: i,
        })
      }
    }
  }

  // maxPerPage and requiredSiblings checks (after all counts are computed)
  for (const [type, count] of countsByType) {
    const contract = manifest.getComponent(type)
    if (!contract) continue

    if (contract.composition.maxPerPage !== null && count > contract.composition.maxPerPage) {
      issues.push({
        severity: 'error',
        rule: 'max-per-page',
        message: `Component "${type}" appears ${count} times but the maximum allowed is ${contract.composition.maxPerPage}`,
      })
    }

    for (const required of contract.composition.requiredSiblings) {
      if (!countsByType.has(required)) {
        issues.push({
          severity: 'warning',
          rule: 'required-sibling-missing',
          message: `Component "${type}" expects a sibling "${required}" but none is present`,
        })
      }
    }
  }

  const errors = issues.filter((i) => i.severity === 'error')
  return { valid: errors.length === 0, issues }
}

export function findAntiPatterns(input: CompositionInput, manifest: LoadedManifest) {
  const matches: Array<{
    pattern: string
    why: string
    useInstead?: string
    blockIndex: number
  }> = []

  // Multiple heroes / other max-per-page violations are already caught by validate.
  // Here we detect more subtle anti-patterns derived from each component's
  // antiExamples plus structural heuristics.

  const counts = new Map<string, number>()
  for (const block of input.blocks) {
    counts.set(block.type, (counts.get(block.type) ?? 0) + 1)
  }

  for (let i = 0; i < input.blocks.length; i++) {
    const block = input.blocks[i]!
    const contract = manifest.getComponent(block.type)
    if (!contract) continue

    // Surface structural anti-examples
    for (const anti of contract.antiExamples) {
      // Very simple keyword matching: if the anti-example mentions "multiple",
      // "end of page", "last", or a specific sibling and the current layout
      // triggers that condition, surface it.
      if (anti.label.toLowerCase().includes('multiple') && (counts.get(block.type) ?? 0) > 1) {
        matches.push({
          pattern: anti.label,
          why: anti.why,
          useInstead: anti.useInstead,
          blockIndex: i,
        })
      }
      if (
        (anti.label.toLowerCase().includes('end of page') || anti.label.toLowerCase().includes('bottom')) &&
        i === input.blocks.length - 1 &&
        contract.composition.placement.includes('page')
      ) {
        matches.push({
          pattern: anti.label,
          why: anti.why,
          useInstead: anti.useInstead,
          blockIndex: i,
        })
      }
    }
  }

  return matches
}
```

### C5.7 — Build the simple read tools

`src/tools/list-components.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition, McpToolContext } from '@forumone/claude-cms-plugin-contract'
import type { ManifestLoader } from '../manifest-source'

export function createListComponentsTool(loader: ManifestLoader): McpToolDefinition {
  return {
    name: 'list_components',
    description:
      'Returns the list of components available in the design system. Use this to discover what components exist before composing content.',
    inputSchema: z.object({
      category: z.string().optional().describe('Optional: filter to a single category (hero, card, section, etc.)'),
    }),
    handler: async (input, ctx) => {
      const manifest = await loader.get()
      const components = input.category
        ? manifest.listByCategory(input.category)
        : Object.values(manifest.raw.components)

      return components.map((c) => ({
        name: c.name,
        category: c.category,
        description: c.description,
      }))
    },
  }
}
```

`src/tools/get-contract.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import type { ManifestLoader } from '../manifest-source'

export function createGetContractTool(loader: ManifestLoader): McpToolDefinition {
  return {
    name: 'get_contract',
    description:
      'Returns the full contract for a named component, including intent, composition rules, content fields, variants, tokens, accessibility requirements, examples, and anti-examples.',
    inputSchema: z.object({
      name: z.string().describe('The PascalCase name of the component'),
    }),
    handler: async (input, ctx) => {
      const manifest = await loader.get()
      const contract = manifest.getComponent(input.name)
      if (!contract) {
        return { error: `Component "${input.name}" not found in the design system` }
      }
      return contract
    },
  }
}
```

`src/tools/get-variants.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import type { ManifestLoader } from '../manifest-source'

export function createGetVariantsTool(loader: ManifestLoader): McpToolDefinition {
  return {
    name: 'get_variants',
    description:
      'Returns the available variants for a component, with descriptions and guidance about when to use each.',
    inputSchema: z.object({
      name: z.string(),
    }),
    handler: async (input) => {
      const manifest = await loader.get()
      const contract = manifest.getComponent(input.name)
      if (!contract) {
        return { error: `Component "${input.name}" not found` }
      }
      return { variants: contract.content.variants ?? [] }
    },
  }
}
```

`src/tools/get-tokens.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import type { ManifestLoader } from '../manifest-source'

export function createGetTokensTool(loader: ManifestLoader): McpToolDefinition {
  return {
    name: 'get_tokens',
    description:
      'Returns the design tokens a component consumes and the token-backed props that can be configured.',
    inputSchema: z.object({
      name: z.string(),
    }),
    handler: async (input) => {
      const manifest = await loader.get()
      const contract = manifest.getComponent(input.name)
      if (!contract) {
        return { error: `Component "${input.name}" not found` }
      }
      return contract.tokens
    },
  }
}
```

### C5.8 — Build suggest_for_intent

`src/tools/suggest-for-intent.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import { withMeta, getAuditWriter } from '@forumone/claude-cms-core'
import type { ManifestLoader } from '../manifest-source'
import type { Matcher, RankedSuggestion } from '../matching'
import { validateComposition } from '../validation/composition'
import type { Payload } from 'payload'

export interface SuggestForIntentDeps {
  loader: ManifestLoader
  matcher: Matcher
  payload: Payload
  maxRecommendations: number
}

export function createSuggestForIntentTool(deps: SuggestForIntentDeps): McpToolDefinition {
  return {
    name: 'suggest_for_intent',
    description:
      "Given a natural-language description of what the user is trying to accomplish, returns ranked component recommendations with reasoning. Optionally accepts the existing page context to avoid duplicate Heroes, flag composition conflicts, etc.",
    inputSchema: withMeta({
      intent: z.string().min(5).describe('Natural-language description of what to accomplish'),
      context: z
        .object({
          existingBlocks: z.array(z.string()).optional().describe('Component names already on the page'),
          pageType: z.string().optional().describe('Optional page type context (landing, article, program, etc.)'),
        })
        .optional(),
    }),
    handler: async (input, ctx) => {
      const manifest = await deps.loader.get()
      const allComponents = Object.values(manifest.raw.components)

      // Rank all components by intent
      const ranked = deps.matcher.rank(input.intent, allComponents)

      // Filter by composition: if the intent produces a component that would
      // violate composition rules given existing blocks, warn but don't exclude.
      const recommendations: RankedSuggestion[] = []
      for (const { component, score } of ranked.slice(0, deps.maxRecommendations * 2)) {
        const warnings: string[] = []

        if (input.context?.existingBlocks) {
          const proposedBlocks = [
            ...input.context.existingBlocks.map((t) => ({ type: t })),
            { type: component.name },
          ]
          const validationResult = validateComposition({ blocks: proposedBlocks }, manifest)
          for (const issue of validationResult.issues) {
            if (issue.severity === 'error' && issue.blockIndex === proposedBlocks.length - 1) {
              warnings.push(issue.message)
            }
          }
        }

        const matchedExample = component.examples[0]
        recommendations.push({
          component: component.name,
          score,
          reasoning: formatReasoning(component, warnings, score),
          matchedIntent: matchedExample?.intent ?? component.intent,
          warnings: warnings.length > 0 ? warnings : undefined,
        })

        if (recommendations.length >= deps.maxRecommendations) break
      }

      // Audit
      const auditWriter = getAuditWriter(deps.payload)
      await auditWriter({
        actor: {
          type: 'user',
          userId: ctx.user?.id,
          userName: ctx.user?.name,
          apiKeyName: ctx.apiKeyName,
        },
        action: 'design.suggest',
        mcpServer: 'component',
        mcpTool: 'suggest_for_intent',
        prompt: input._meta?.userPrompt ?? input.intent,
        reasoning: input._meta?.reasoning,
        changesSummary: `Suggested components for: ${input.intent.slice(0, 120)}`,
      })

      return { recommendations }
    },
  }
}

function formatReasoning(
  component: { name: string; description: string; intent: string },
  warnings: string[],
  score: number,
): string {
  const confidence = score > 0.3 ? 'strong match' : score > 0.1 ? 'moderate match' : 'possible match'
  let reasoning = `${component.name}: ${confidence}. ${component.description}`
  if (warnings.length > 0) {
    reasoning += ` Note: ${warnings.join(' ')}`
  }
  return reasoning
}
```

### C5.9 — Build validate_composition and find_anti_pattern

`src/tools/validate-composition.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import { withMeta, getAuditWriter } from '@forumone/claude-cms-core'
import type { ManifestLoader } from '../manifest-source'
import { validateComposition } from '../validation/composition'
import type { Payload } from 'payload'

export function createValidateCompositionTool(
  loader: ManifestLoader,
  payload: Payload,
): McpToolDefinition {
  return {
    name: 'validate_composition',
    description:
      'Validates a proposed page layout against the design system\'s composition rules. Returns errors (blocking) and warnings (advisory).',
    inputSchema: withMeta({
      blocks: z
        .array(
          z.object({
            type: z.string(),
            variant: z.string().optional(),
          }),
        )
        .min(1),
    }),
    handler: async (input, ctx) => {
      const manifest = await loader.get()
      const result = validateComposition({ blocks: input.blocks }, manifest)

      const auditWriter = getAuditWriter(payload)
      await auditWriter({
        actor: {
          type: 'user',
          userId: ctx.user?.id,
          apiKeyName: ctx.apiKeyName,
        },
        action: 'design.validate',
        mcpServer: 'component',
        mcpTool: 'validate_composition',
        prompt: input._meta?.userPrompt,
      })

      return result
    },
  }
}
```

`src/tools/find-anti-pattern.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import { withMeta, getAuditWriter } from '@forumone/claude-cms-core'
import type { ManifestLoader } from '../manifest-source'
import { findAntiPatterns } from '../validation/composition'
import type { Payload } from 'payload'

export function createFindAntiPatternTool(
  loader: ManifestLoader,
  payload: Payload,
): McpToolDefinition {
  return {
    name: 'find_anti_pattern',
    description:
      "Scans a proposed composition for known design anti-patterns. Returns matches with explanation and suggested alternatives. Use before publishing to surface editorial issues.",
    inputSchema: withMeta({
      blocks: z
        .array(
          z.object({
            type: z.string(),
            variant: z.string().optional(),
          }),
        )
        .min(1),
    }),
    handler: async (input, ctx) => {
      const manifest = await loader.get()
      const matches = findAntiPatterns({ blocks: input.blocks }, manifest)

      const auditWriter = getAuditWriter(payload)
      await auditWriter({
        actor: {
          type: 'user',
          userId: ctx.user?.id,
          apiKeyName: ctx.apiKeyName,
        },
        action: 'design.find_anti_pattern',
        mcpServer: 'component',
        mcpTool: 'find_anti_pattern',
        prompt: input._meta?.userPrompt,
      })

      return { matches }
    },
  }
}
```

`src/tools/index.ts`:

```typescript
export { createListComponentsTool } from './list-components'
export { createGetContractTool } from './get-contract'
export { createGetVariantsTool } from './get-variants'
export { createGetTokensTool } from './get-tokens'
export { createSuggestForIntentTool } from './suggest-for-intent'
export { createValidateCompositionTool } from './validate-composition'
export { createFindAntiPatternTool } from './find-anti-pattern'
```

### C5.10 — Build the plugin

`src/plugin.ts`:

```typescript
import type { CorePlugin } from '@forumone/claude-cms-plugin-contract'
import { getPluginRegistry } from '@forumone/claude-cms-plugin-contract'
import { createMcpHandler, createNamedLogger } from '@forumone/claude-cms-core'
import { validateOptions, type ComponentsPluginOptions } from './options'
import { createManifestLoader } from './manifest-source'
import { createTfidfMatcher, createEmbeddingsMatcher } from './matching'
import {
  createListComponentsTool,
  createGetContractTool,
  createGetVariantsTool,
  createGetTokensTool,
  createSuggestForIntentTool,
  createValidateCompositionTool,
  createFindAntiPatternTool,
} from './tools'

export const componentsPlugin: CorePlugin<ComponentsPluginOptions> = (rawOptions) => (incomingConfig) => {
  if (rawOptions.enabled === false) return incomingConfig

  const options = validateOptions(rawOptions)
  const routePrefix = options.routePrefix ?? '/api/components'
  const logger = createNamedLogger('components', options.logger)

  return {
    ...incomingConfig,
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      {
        path: `${routePrefix}/mcp`,
        method: 'post',
        handler: async (req) => {
          // The Payload request contains a .payload property. We need the
          // MCP handler wired at onInit (when payload is available).
          const handler = (req.payload as unknown as Record<symbol, unknown>)[MCP_HANDLER_SYMBOL] as
            | ((r: Request) => Promise<Response>)
            | undefined
          if (!handler) {
            return new Response(JSON.stringify({ error: 'Components MCP not initialized' }), {
              status: 503,
              headers: { 'content-type': 'application/json' },
            })
          }
          return handler(req as unknown as Request)
        },
      },
    ],
    onInit: async (payload) => {
      if (incomingConfig.onInit) await incomingConfig.onInit(payload)

      const registry = getPluginRegistry(payload)
      registry.requireCapability('audit-log', '@forumone/claude-cms-components')

      const loader = createManifestLoader(options.manifest, payload)
      // Eagerly load to fail fast on misconfiguration
      const manifest = await loader.get()
      logger.info('Manifest loaded', {
        designSystem: manifest.designSystem.name,
        componentCount: manifest.listComponents().length,
      })

      const matcherConfig = options.matching ?? { strategy: 'tfidf' }
      const matcher =
        matcherConfig.strategy === 'embeddings' && matcherConfig.embeddings
          ? createEmbeddingsMatcher(matcherConfig.embeddings)
          : createTfidfMatcher()

      // Pre-rank to build the matcher index.
      matcher.rank('', Object.values(manifest.raw.components))

      const tools = [
        createListComponentsTool(loader),
        createGetContractTool(loader),
        createGetVariantsTool(loader),
        createGetTokensTool(loader),
        createSuggestForIntentTool({
          loader,
          matcher,
          payload,
          maxRecommendations: matcherConfig.maxRecommendations ?? 5,
        }),
        createValidateCompositionTool(loader, payload),
        createFindAntiPatternTool(loader, payload),
      ]

      const handler = createMcpHandler({
        payload,
        serverName: 'components',
        tools,
        logger: {
          info: (m, c) => logger.info(m, c),
          error: (m, c) => logger.error(m, c),
        },
      })

      attachMcpHandler(payload, handler)

      registry.register({
        id: '@forumone/claude-cms-components',
        version: '0.1.0',
        capabilities: ['component-server', 'manifest-loading', 'intent-matching'],
      })
    },
  }
}

const MCP_HANDLER_SYMBOL = Symbol.for('@forumone/claude-cms/components-mcp-handler')

function attachMcpHandler(payload: unknown, handler: (r: Request) => Promise<Response>) {
  Object.defineProperty(payload as object, MCP_HANDLER_SYMBOL, {
    value: handler,
    enumerable: false,
    writable: false,
  })
}
```

### C5.11 — Write the index exports

`src/index.ts`:

```typescript
export { componentsPlugin } from './plugin'
export type { ComponentsPluginOptions, ManifestSource, MatchingConfig } from './options'
```

Deliberately narrow. Clients don't need to know about matchers or validation internals; those are implementation details.

### C5.12 — Write tests

Testing priorities:

- `matching/tfidf.test.ts` — known queries return expected ranked results against a fixture manifest (use reference DS as fixture)
- `validation/composition.test.ts` — validates correct compositions, catches forbiddenAdjacent, catches maxPerPage, catches unknown components, catches unknown variants
- `tools/*.test.ts` — each tool handler produces correct output for representative inputs
- `plugin.test.ts` — plugin registers correctly, fails loudly on invalid manifest, attaches MCP handler

Use the reference design system manifest as the test fixture — it's already generated and imports cleanly as `@forumone/claude-cms-reference-ds/manifest`.

Example fixture test:

```typescript
import { describe, it, expect } from 'vitest'
import { loadManifest } from '@forumone/claude-cms-design-contract'
import { createTfidfMatcher } from './tfidf'
import manifest from '@forumone/claude-cms-reference-ds/manifest'

describe('TF-IDF matcher against reference DS', () => {
  it('ranks Hero highly for page-opener intents', () => {
    const loaded = loadManifest(manifest)
    const matcher = createTfidfMatcher()
    const components = Object.values(loaded.raw.components)

    const ranked = matcher.rank('introduce a new fellowship program on a landing page', components)
    expect(ranked[0]?.component.name).toBe('Hero')
  })

  it('ranks FAQ highly for Q&A intents', () => {
    // ...
  })

  it('ranks Stats highly for data display intents', () => {
    // ...
  })
})
```

Aim for 80%+ coverage.

### C5.13 — Wire the playground

In the playground app (`apps/playground/`), add the Component Server to the config and verify end-to-end:

```typescript
// apps/playground/src/payload.config.ts
import { auditPlugin, createInngestClient } from '@forumone/claude-cms-core'
import { componentsPlugin } from '@forumone/claude-cms-components'
import manifest from '@forumone/claude-cms-reference-ds/manifest'

const inngest = createInngestClient({ id: 'claude-cms-playground' })

export default buildConfig({
  // ...
  plugins: [
    auditPlugin({ inngest }),
    componentsPlugin({
      manifest: { type: 'object', manifest },
      matching: { strategy: 'tfidf' },
    }),
  ],
})
```

Run the playground, create an MCP API key, connect Claude, ask:

- "What components are available?" → `list_components`
- "Show me the Hero contract" → `get_contract`
- "What component should I use to introduce our new climate program?" → `suggest_for_intent`
- "I'm building a landing page with a Hero and an FAQ. Should I add anything else?" → `suggest_for_intent` with context
- "Can I use two Hero components on the same page?" → `validate_composition` returns error
- "Check this layout for anti-patterns: Hero, CardGrid, Hero" → `find_anti_pattern` surfaces multiple Heroes

Verify each tool behaves correctly. Fix anything that doesn't.

### C5.14 — Write the README

`README.md`:

```markdown
# @forumone/claude-cms-components

MCP server that exposes a design system manifest as conversational primitives.

## What this package provides

Seven MCP tools:

- `list_components` — discover what's available
- `get_contract` — full contract for a named component
- `get_variants` — available variants and when to use each
- `get_tokens` — design tokens a component consumes
- `suggest_for_intent` — ranked recommendations for a natural-language intent
- `validate_composition` — check a proposed layout against composition rules
- `find_anti_pattern` — surface design anti-patterns before publishing

## Installation

```bash
pnpm add @forumone/claude-cms-components
```

## Usage

```typescript
import { buildConfig } from 'payload'
import { auditPlugin } from '@forumone/claude-cms-core'
import { componentsPlugin } from '@forumone/claude-cms-components'
import manifest from '@my-company/design-system/manifest'

export default buildConfig({
  // ...
  plugins: [
    auditPlugin(), // Required. componentsPlugin depends on audit.
    componentsPlugin({
      manifest: { type: 'object', manifest },
      matching: { strategy: 'tfidf' },
    }),
  ],
})
```

The MCP server is available at `/api/components/mcp` (override with `routePrefix`).

## Manifest sources

Three ways to provide the manifest:

**Imported object** (simplest):
```typescript
componentsPlugin({
  manifest: { type: 'object', manifest: importedManifest },
})
```

**Remote URL** (for decoupled deployment):
```typescript
componentsPlugin({
  manifest: {
    type: 'url',
    url: 'https://design-system.example.com/manifest.json',
    refreshInterval: 3600, // seconds
  },
})
```

**Payload collection** (for admin-editable metadata):
```typescript
componentsPlugin({
  manifest: { type: 'payload-collection', slug: 'design-system-manifest' },
})
```

## Intent matching

Two strategies:

**TF-IDF** (default, no external dependencies):
```typescript
matching: { strategy: 'tfidf' }
```

**Embeddings** (higher quality, requires API):
```typescript
matching: {
  strategy: 'embeddings',
  embeddings: { provider: 'voyage', apiKey: process.env.VOYAGE_API_KEY },
}
```

Start with TF-IDF. Upgrade to embeddings if recommendation quality is insufficient for your content.

## Related packages

- `@forumone/claude-cms-design-contract` — the schema your manifest satisfies
- `@forumone/claude-cms-reference-ds` — reference design system you can use as a fixture
- `@forumone/claude-cms-core` — required peer; provides the audit log this plugin writes to
```

### C5.15 — Changeset and release

```bash
pnpm changeset
```

Select `@forumone/claude-cms-components`, choose `minor`:

> Initial release. MCP server exposing design system manifests as seven conversational tools: list_components, get_contract, get_variants, get_tokens, suggest_for_intent, validate_composition, find_anti_pattern. Supports TF-IDF and embedding-based intent matching. Accepts manifests as imported objects, remote URLs, or Payload collections.

## Acceptance criteria

- [ ] `@forumone/claude-cms-components` builds and tests pass
- [ ] Plugin options validate with Zod; invalid configs throw at plugin init with clear messages
- [ ] Manifest loader supports object, URL, and Payload collection sources
- [ ] URL source honors refreshInterval for periodic refresh
- [ ] All seven MCP tools are implemented and respond correctly
- [ ] Intent matching produces sensible rankings for at least 5 distinct intents against the reference DS
- [ ] Composition validation correctly catches forbiddenAdjacent, maxPerPage, unknown components, unknown variants
- [ ] Anti-pattern detection surfaces at least multiple-hero and hero-at-end-of-page cases
- [ ] Plugin uses `requireCapability('audit-log')` and fails at init if audit plugin isn't registered
- [ ] Audit writer receives a record for every consequential tool call
- [ ] Tools accept `_meta` parameter for prompt and reasoning context
- [ ] Playground app wires componentsPlugin successfully against the reference DS manifest
- [ ] Claude can connect to the deployed MCP endpoint and use all seven tools
- [ ] Test coverage is 80%+
- [ ] Package publishes cleanly as 0.1.0

## Notes for Claude Code

- The MCP handler symbol pattern (C5.10) is how we expose the handler to the endpoint without exposing it publicly. This same pattern recurs in every subsequent server package (C6-C9). Keep the symbol names distinct per-plugin to avoid collisions.
- Eager manifest loading at `onInit` is deliberate. If the manifest is broken, the plugin should fail during deploy, not at the first request. Resist the urge to make this lazy.
- The TF-IDF matcher's index is built on first `rank()` call. The plugin pre-builds it at init by calling `matcher.rank('', components)`. This looks weird but avoids a separate `index()` method on the Matcher interface. Document this quirk in a code comment.
- Intent matching quality is what marketers will judge the system on. Budget time at the end of the phase to test many diverse intents against the reference DS and tune the search document composition (the `makeSearchDocument` function). Small changes there — weighting intent higher than description, including variant names, etc. — produce big quality improvements.
- The embeddings matcher has an async/sync interface mismatch. In practice the tool handler does:
  1. `await embedQuery(input.intent)` to get the query vector (async)
  2. `matcher.score(queryVector, componentVectors)` to rank (sync)
  For Phase 1, either implement this properly in `suggestForIntent` or ship with TF-IDF only and add embeddings in a follow-up. Don't ship half-working embeddings.
- When writing tool descriptions for Claude, be specific about *when* to use each tool. Claude chooses which tool to call based on these descriptions. Bad descriptions cause Claude to ask the user for clarification instead of acting, or worse, call the wrong tool. Iterate on descriptions while testing.
- The `_meta.changesSummary` field may not make sense for read-only tools like `list_components`. That's fine — leave it optional everywhere. It only matters for writes (which this package doesn't have).
- Commit after each major section: options (C5.2), manifest source (C5.3), each matcher (C5.4-C5.5), validation (C5.6), read tools (C5.7), suggest (C5.8), write validations (C5.9), plugin (C5.10).

## What's next

Phase C6 builds the Publishing Server — the most architecturally consequential server package. It wraps Payload's update operation with policy enforcement, composition validation (calling through to this package), accessibility checks, approval gating, and downstream event orchestration. It's the trust boundary where "this change is allowed to ship" gets decided.

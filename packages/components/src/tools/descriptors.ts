import type { McpToolDescriptor } from '@forumone/throughline-core'

/*
This server's tools, by name and description, knowable without a Payload.

`@payloadcms/plugin-mcp` reads exactly these two fields while the host's config
is being built, to generate one per-key checkbox per tool, and denies any tool it
has no checkbox for. The handlers close over the manifest loader and the matcher,
which are built at `onInit` — the names never needed to wait for them.

The factories below spread these, so the two cannot drift.
*/
export const COMPONENTS_TOOLS = {
  listComponents: {
    name: 'list_components',
    description:
      'Returns the list of components available in the design system. Use this to discover what components exist before composing content.',
  },
  getContract: {
    name: 'get_contract',
    description:
      'Returns the full contract for a named component, including intent, composition rules, content fields, variants, tokens, accessibility requirements, examples, and anti-examples.',
  },
  getVariants: {
    name: 'get_variants',
    description:
      'Returns the available variants for a component, with descriptions and guidance about when to use each.',
  },
  getTokens: {
    name: 'get_tokens',
    description:
      'Returns the design tokens a component consumes plus the configurable token-backed props and their allowed values.',
  },
  suggestForIntent: {
    name: 'suggest_for_intent',
    description:
      'Given a natural-language description of what the author wants to accomplish, returns ranked component recommendations with reasoning. Optionally accepts the existing page context so duplicate Heroes / composition conflicts surface as warnings on the suggestions.',
  },
  validateComposition: {
    name: 'validate_composition',
    description:
      "Validates a proposed page layout against the design system's composition rules. Returns errors (blocking publish) and warnings (advisory). Call this before recommending a final layout.",
  },
  findAntiPattern: {
    name: 'find_anti_pattern',
    description:
      'Scans a proposed composition for known design anti-patterns (multiple Heroes, Hero at the bottom of a page, etc.). Returns matches with explanation and suggested alternatives. Use before publishing to surface editorial issues.',
  },
} as const satisfies Record<string, McpToolDescriptor>

/** Every tool this server contributes, for the collector. */
export const COMPONENTS_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] =
  Object.values(COMPONENTS_TOOLS)

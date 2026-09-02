import { formatZodIssues } from '@forumone/throughline-core'
import type { McpToolCollector } from '@forumone/throughline-core'
import { z } from 'zod'
import type { BaseCorePluginOptions } from '@forumone/throughline-plugin-contract'
import type { Manifest } from '@forumone/throughline-design-contract'

export type ManifestSource =
  | { type: 'object'; manifest: Manifest }
  | { type: 'url'; url: string; refreshInterval?: number }
  | { type: 'payload-collection'; slug: string; documentId?: string }

export interface MatchingConfig {
  /**
   * Strategy for ranking components against a natural-language intent.
   * `tfidf` ships now and requires no external dependencies; `embeddings`
   * is reserved for a follow-up.
   */
  strategy: 'tfidf'
  /** Maximum number of recommendations from `suggest_for_intent`. Default: 5. */
  maxRecommendations?: number
}

/*
`routePrefix` is omitted rather than ignored — see the note in the audit
plugin's options. This server's only endpoint was `/<prefix>/mcp`, and its
tools now reach a client through the host's `mcpPlugin`.
*/
export interface ComponentsPluginOptions extends Omit<BaseCorePluginOptions, 'routePrefix'> {
  /** Required: where the design system manifest comes from. */
  manifest: ManifestSource
  /** Optional: how the plugin matches intents to components. Defaults to TF-IDF. */
  matching?: MatchingConfig

  /**
   * Where to put this server's MCP tools so Payload's own MCP plugin can serve
   * them.
   *
   * `createMcpToolCollector()` from `@forumone/throughline-core`. The host hands
   * its array to `@payloadcms/plugin-mcp` at config time and this plugin fills
   * it at `onInit` — which is the first moment the tools can exist, since they
   * close over `payload`, and still before any request reads the array.
   *
   * Omit it and nothing changes: this server keeps its own `/mcp` endpoint,
   * which is what lets a host move one server at a time.
   */
  mcpTools?: McpToolCollector
}

const ManifestSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('object'), manifest: z.unknown() }),
  z.object({
    type: z.literal('url'),
    url: z.string().url(),
    refreshInterval: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('payload-collection'),
    slug: z.string().min(1),
    documentId: z.string().optional(),
  }),
])

export const ComponentsPluginOptionsSchema = z.object({
  enabled: z.boolean().optional(),
  manifest: ManifestSourceSchema,
  matching: z
    .object({
      strategy: z.enum(['tfidf']),
      maxRecommendations: z.number().int().positive().optional(),
    })
    .optional(),
})

/**
 * Validates plugin options at load time. Throws with a multi-line message
 * on schema failure or with a targeted message on cross-field violations.
 * Plugins that depend on this server must initialize after `componentsPlugin`
 * because the registry capability check happens during onInit.
 */
export function validateOptions(options: ComponentsPluginOptions): ComponentsPluginOptions {
  const result = ComponentsPluginOptionsSchema.safeParse(options)
  if (!result.success) {
    const issues = formatZodIssues(result.error)
    throw new Error(`Invalid componentsPlugin options:\n${issues}`)
  }
  return options
}

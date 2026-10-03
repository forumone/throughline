import { z } from 'zod'
import type { Payload, PayloadRequest } from 'payload'
import type { McpToolDefinition } from '../../index.js'
import type { McpToolDescriptor } from '../../index.js'
import { searchContent } from './search.js'
import type { SearchSource } from './sources.js'

/*
The command palette's search, as an MCP tool: the same query per collection the
palette sends, as the caller, ranked the same way.
*/

export const PALETTE_TOOLS = {
  searchContent: {
    name: 'search_content',
    description:
      "Finds documents by a few letters of their title, across every collection the admin's Cmd-K palette searches (pages, posts, people, media and so on), including drafts. Results are ranked as the palette ranks them: exact title, then prefix, then a word starting with the query, then anywhere. Each has its admin link. Use to find the id of a document someone names before reading or editing it.",
  },
} as const satisfies Record<string, McpToolDescriptor>

export const PALETTE_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] = Object.values(PALETTE_TOOLS)

const inputSchema = z.object({
  query: z.string().min(1).describe('A few letters of the title, e.g. "about".'),
  collections: z
    .array(z.string())
    .optional()
    .describe('Only these collection slugs. Default: all searched.'),
  perCollection: z
    .number()
    .int()
    .positive()
    .max(25)
    .optional()
    .describe('Results per collection. Default: 5.'),
})

export function createSearchContentTool(deps: {
  payload: Payload
  sources: readonly SearchSource[]
}): McpToolDefinition<typeof inputSchema> {
  return {
    ...PALETTE_TOOLS.searchContent,
    inputSchema,
    handler: async (input, ctx) => {
      if (!ctx.user) {
        return {
          error:
            'Must be authenticated: search runs with your own access, and an API key alone carries no identity.',
        }
      }
      const known = new Set(deps.sources.map((source) => source.slug))
      const unknown = (input.collections ?? []).filter((slug) => !known.has(slug))
      if (unknown.length > 0) {
        return { error: `Not searched: ${unknown.join(', ')}. Searched: ${[...known].join(', ')}.` }
      }
      const hits = await searchContent(deps.payload, {
        sources: input.collections
          ? deps.sources.filter((source) => input.collections!.includes(source.slug))
          : deps.sources,
        query: input.query,
        // The same cast and the same reason as publishing's `resolvePublishingActor`.
        user: ctx.user as unknown as PayloadRequest['user'],
        ...(input.perCollection ? { perSource: input.perCollection } : {}),
      })
      const admin = deps.payload.config.routes.admin
      return {
        query: input.query.trim(),
        results: hits.map((hit) => ({
          ...hit,
          adminUrl: `${admin}/collections/${hit.collection}/${encodeURIComponent(String(hit.id))}`,
        })),
      }
    },
  }
}

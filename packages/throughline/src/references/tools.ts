import { z } from 'zod'
import type { Block, CollectionSlug, Payload } from 'payload'
import type { McpToolContext, McpToolDefinition } from '../plugin-contract/index.js'
import type { McpToolDescriptor } from '../mcp/collector.js'
import { deniedEnvelope } from '../mcp/envelope.js'
import { findReferences, type DocumentReferences } from './find.js'
import { referenceRefusal } from './guards.js'

/*
The MCP counterparts of the "Used on" panel and the delete guard.

Both read past access control, as the guard does, because the question is about
the database: a draft the caller cannot see still breaks when its image goes. So
by default only admins and editors may ask, the same line the audit tools draw,
since the answer names documents by title. A host can draw it elsewhere with
`canUse`.
*/

export const REFERENCE_TOOLS = {
  findReferences: {
    name: 'find_references',
    description:
      'Lists every document and global that references a document: an image, a person, a taxonomy term, or anything else that can be linked or embedded. Covers references inside blocks and rich text, which Payload itself cannot query, and both the published and draft state of each document. Use before replacing or deleting something shared, or to answer "where is this used?".',
  },
  canDelete: {
    name: 'can_delete',
    description:
      'Whether a document can be deleted or moved to the trash without breaking another document that uses it. Returns canDelete, and when false, the documents that still reference it and the message an editor would see. Deleting is refused while anything references a guarded document, so ask this first and remove the references before trying.',
  },
} as const satisfies Record<string, McpToolDescriptor>

export const REFERENCE_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] =
  Object.values(REFERENCE_TOOLS)

export interface ReferenceToolDeps {
  payload: Payload
  /** Collections whose deletes are refused while referenced, with their nouns. */
  guarded: ReadonlyMap<string, { noun?: string; consequence?: string }>
  blocks?: readonly Block[]
  /** Who may ask. Default: a user with the `admin` or `editor` role. */
  canUse?: (ctx: McpToolContext) => boolean
}

const inputSchema = z.object({
  collection: z.string().describe('The collection slug of the document, e.g. "media".'),
  id: z.union([z.string(), z.number()]).describe('The document id.'),
})

const findInputSchema = inputSchema.extend({
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe('Max documents to list. Default: 50.'),
})

function defaultCanUse(ctx: McpToolContext): boolean {
  const roles = ctx.user?.roles ?? []
  return roles.includes('admin') || roles.includes('editor')
}

function summarize(entry: DocumentReferences) {
  return {
    collection: entry.collection,
    id: entry.id,
    label: entry.label,
    ...(entry.global ? { global: true } : {}),
    insideBlock: entry.viaBlock,
    paths: entry.references.map((reference) => reference.path),
  }
}

/** Refuses an unknown collection by name rather than scanning for nothing. */
function unknownCollection(payload: Payload, collection: string) {
  const known = payload.config.collections.some((c) => c.slug === collection)
  return known ? undefined : { error: `There is no collection "${collection}".` }
}

async function scan(deps: ReferenceToolDeps, collection: string, id: number | string) {
  return findReferences(
    deps.payload,
    { collection: collection as CollectionSlug, id },
    deps.blocks ? { blocks: deps.blocks } : {},
  )
}

export function createFindReferencesTool(
  deps: ReferenceToolDeps,
): McpToolDefinition<typeof findInputSchema> {
  const canUse = deps.canUse ?? defaultCanUse
  return {
    ...REFERENCE_TOOLS.findReferences,
    inputSchema: findInputSchema,
    handler: async (input, ctx) => {
      if (!canUse(ctx))
        return deniedEnvelope('Only admins and editors can look up where a document is used.')
      const unknown = unknownCollection(deps.payload, input.collection)
      if (unknown) return unknown

      const found = await scan(deps, input.collection, input.id)
      const limit = input.limit ?? 50
      return {
        collection: input.collection,
        id: input.id,
        count: found.length,
        insideBlocks: found.filter((entry) => entry.viaBlock).length,
        documents: found.slice(0, limit).map(summarize),
        ...(found.length > limit ? { truncated: true } : {}),
      }
    },
  }
}

export function createCanDeleteTool(
  deps: ReferenceToolDeps,
): McpToolDefinition<typeof inputSchema> {
  const canUse = deps.canUse ?? defaultCanUse
  return {
    ...REFERENCE_TOOLS.canDelete,
    inputSchema,
    handler: async (input, ctx) => {
      if (!canUse(ctx))
        return deniedEnvelope(
          'Only admins and editors can check whether a document can be deleted.',
        )
      const unknown = unknownCollection(deps.payload, input.collection)
      if (unknown) return unknown

      const found = await scan(deps, input.collection, input.id)
      const guard = deps.guarded.get(input.collection)
      if (found.length === 0) {
        return {
          collection: input.collection,
          id: input.id,
          canDelete: true,
          guarded: guard !== undefined,
        }
      }
      return {
        collection: input.collection,
        id: input.id,
        /*
        False even for an unguarded collection: the delete would go through, but
        it would break the documents listed. `guarded` says which it is.
        */
        canDelete: false,
        guarded: guard !== undefined,
        referencedBy: found.length,
        documents: found.slice(0, 20).map(summarize),
        message: referenceRefusal(found, {
          ...(guard?.noun ? { noun: guard.noun } : {}),
          ...(guard?.consequence ? { consequence: guard.consequence } : {}),
        }),
      }
    },
  }
}

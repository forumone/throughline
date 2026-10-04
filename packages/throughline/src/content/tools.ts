import { z } from 'zod'
import {
  createLocalReq,
  type Block,
  type CollectionSlug,
  type Payload,
  type PayloadRequest,
  type Where,
} from 'payload'
import type { McpToolContext, McpToolDefinition } from '../plugin-contract/index.js'
import type { McpToolDescriptor } from '../mcp/collector.js'
import { deniedEnvelope } from '../mcp/envelope.js'
import { matchRank } from '../editorial/palette/sources.js'
import { describeFields, writableFields, type DescribeContext } from './describe.js'
import type { ContentCollectionOptions, RelatedKindOptions } from './options.js'

/*
The read half of the content tools: what an agent needs before it writes.

Every read runs as the key's person with `overrideAccess: false`, so it sees
what they would see in the admin and nothing more. The answer for a document is
in the shape the write tools take — the authored fields only, relationships as
ids, blocks with their ids — so a read can be edited and handed straight back.
*/

export const CONTENT_READ_TOOLS = {
  describeContentType: {
    name: 'describe_content_type',
    description:
      'What a content type is made of, before creating or editing one: every field an author may set, with its type, limits, whether it is required, a select\'s options, and for a link to another document the `find_related` kind that finds one. A blocks field lists the blocks it accepts (look each up with `get_contract`). Also what the page template already draws, so the layout does not repeat it, and what publishing requires. Read from the live configuration.',
  },
  findDocuments: {
    name: 'find_documents',
    description:
      'Finds documents of one content type by title or slug, drafts included, newest first. Each result has its id, title, slug, status (draft or published, of the latest version), when it was last changed, and its admin and preview links. Use before creating something, so an existing document is edited rather than duplicated.',
  },
  findRelated: {
    name: 'find_related',
    description:
      'Looks up something a document links to — an author, a client, a taxonomy term, an image — by a few letters of its name, to get the id a field needs. Images come back with their alt text and dimensions. Which kinds exist is in each field\'s `findWith` from `describe_content_type`. Read only.',
  },
  getDocument: {
    name: 'get_document',
    description:
      'Reads one document in the shape the write tools accept: the fields an author may set, relationships as ids, and blocks with their ids. The latest draft by default; pass draft: false for the published version. Also its status and its admin and preview links.',
  },
} as const satisfies Record<string, McpToolDescriptor>

export const CONTENT_READ_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] =
  Object.values(CONTENT_READ_TOOLS)

export interface ContentToolDeps {
  payload: Payload
  collections: Readonly<Record<string, ContentCollectionOptions>>
  related: Readonly<Record<string, RelatedKindOptions>>
  /** A composed section's block type (forumone-2026#801), which the composition check keeps but does not check. */
  composedBlockType?: string
  canUse?: (ctx: McpToolContext) => boolean
}

export function defaultCanUse(ctx: McpToolContext): boolean {
  const roles = ctx.user?.roles ?? []
  return roles.includes('admin') || roles.includes('editor')
}

const DENIED = 'Only admins and editors can read content through these tools.'

/*
Two refusals before any query. No user means a key with nobody behind it, and
reading as nobody would read past every rule the person is subject to; the role
check is the same line `check_slug` and `find_references` draw.
*/
export function refusal(ctx: McpToolContext, canUse: (ctx: McpToolContext) => boolean) {
  if (!ctx.user) {
    return deniedEnvelope(
      'This key is not tied to a person, and content is read with that person\'s access.',
    )
  }
  if (!canUse(ctx)) return deniedEnvelope(DENIED)
  return undefined
}

/** `ctx.user` as Payload's own user, the cast the publishing tools make for the same reason. */
export function userOf(ctx: McpToolContext): PayloadRequest['user'] {
  return ctx.user as unknown as PayloadRequest['user']
}

export function unknownCollection(deps: ContentToolDeps, collection: string) {
  return {
    error: `"${collection}" is not a content type these tools write. They write: ${Object.keys(deps.collections).join(', ')}.`,
  }
}

export function titleFieldOf(payload: Payload, collection: string): string {
  const config = payload.collections[collection as CollectionSlug]?.config
  return config?.admin?.useAsTitle ?? 'id'
}

export function adminUrl(payload: Payload, collection: string, id: number | string): string {
  return `${payload.config.routes.admin}/collections/${collection}/${encodeURIComponent(String(id))}`
}

/**
 * The collection's own Preview link, absolute. `null` when it has none, or has
 * none for this document yet — a draft with no slug, for instance.
 */
export async function previewUrl(
  payload: Payload,
  collection: string,
  doc: Record<string, unknown>,
  req: PayloadRequest,
): Promise<string | null> {
  const preview = payload.collections[collection as CollectionSlug]?.config.admin?.preview
  if (typeof preview !== 'function') return null
  try {
    const url = await preview(doc, { locale: req.locale ?? undefined, req, token: null } as never)
    if (typeof url !== 'string' || url === '') return null
    return url.startsWith('/') ? `${payload.config.serverURL ?? ''}${url}` : url
  } catch {
    return null
  }
}

export async function requestAs(payload: Payload, ctx: McpToolContext): Promise<PayloadRequest> {
  return createLocalReq({ user: userOf(ctx) ?? undefined } as never, payload)
}

export function blockRegistry(payload: Payload): Map<string, Block> {
  return new Map((payload.config.blocks ?? []).map((block) => [block.slug, block]))
}

/** Collection slug → the `find_related` kind that searches it. */
function findWithIndex(related: ContentToolDeps['related']): Map<string, string> {
  const index = new Map<string, string>()
  for (const [kind, options] of Object.entries(related)) {
    if (!index.has(options.collection)) index.set(options.collection, kind)
  }
  return index
}

/* ------------------------------------------------------------------------ */

const describeInput = z.object({
  collection: z.string().describe('The content type\'s slug, e.g. "posts".'),
})

export function createDescribeContentTypeTool(
  deps: ContentToolDeps,
): McpToolDefinition<typeof describeInput> {
  const canUse = deps.canUse ?? defaultCanUse
  return {
    ...CONTENT_READ_TOOLS.describeContentType,
    inputSchema: describeInput,
    handler: async (input, ctx) => {
      const refused = refusal(ctx, canUse)
      if (refused) return refused
      const options = deps.collections[input.collection]
      const config = deps.payload.collections[input.collection as CollectionSlug]?.config
      if (!options || !config) return unknownCollection(deps, input.collection)

      const describeCtx: DescribeContext = {
        blocks: blockRegistry(deps.payload),
        req: await requestAs(deps.payload, ctx),
        findWith: findWithIndex(deps.related),
      }
      const labels = config.labels as { singular?: unknown; plural?: unknown }
      return {
        collection: input.collection,
        ...(typeof labels.singular === 'string' ? { label: labels.singular } : {}),
        drafts: Boolean(config.versions && (config.versions as { drafts?: unknown }).drafts),
        fields: (
          await describeFields(writableFields(config.fields, options.fields), describeCtx)
        ).map((field) =>
          field.type === 'richText'
            ? {
                ...field,
                accepts: options.richText?.[field.name]
                  ? ['{ markdown: "…" }', '{ html: "…" }', 'an editor state ({ root: … })']
                  : ['an editor state ({ root: … })'],
              }
            : field,
        ),
        ...(options.templateDraws?.length
          ? {
              templateDraws: options.templateDraws,
              templateNote:
                'The page template draws these itself from the document\'s own fields. Do not add them to a blocks field.',
            }
          : {}),
        publishing: {
          requires: options.publishRequires ?? [],
          howTo:
            'Writes are drafts. Run get_publish_status for the full preflight before offering to publish; going live is publish, schedule_publish or request_approval.',
        },
      }
    },
  }
}

/* ------------------------------------------------------------------------ */

const findInput = z.object({
  collection: z.string().describe('The content type\'s slug, e.g. "pages".'),
  query: z
    .string()
    .optional()
    .describe('A few letters of the title or slug. Omit for the most recently changed.'),
  limit: z.number().int().positive().max(50).optional().describe('Default: 10.'),
})

export function createFindDocumentsTool(
  deps: ContentToolDeps,
): McpToolDefinition<typeof findInput> {
  const canUse = deps.canUse ?? defaultCanUse
  return {
    ...CONTENT_READ_TOOLS.findDocuments,
    inputSchema: findInput,
    handler: async (input, ctx) => {
      const refused = refusal(ctx, canUse)
      if (refused) return refused
      const config = deps.payload.collections[input.collection as CollectionSlug]?.config
      if (!deps.collections[input.collection] || !config) {
        return unknownCollection(deps, input.collection)
      }

      const titleField = titleFieldOf(deps.payload, input.collection)
      const q = input.query?.trim() ?? ''
      const hasSlug = config.flattenedFields.some((field) => field.name === 'slug')
      const where: Where | undefined = q
        ? {
            or: [
              { [titleField]: { like: q } },
              ...(hasSlug ? [{ slug: { like: q } }] : []),
            ],
          }
        : undefined
      const drafts = Boolean(config.versions && (config.versions as { drafts?: unknown }).drafts)
      const req = await requestAs(deps.payload, ctx)

      const { docs } = await deps.payload.find({
        collection: input.collection as CollectionSlug,
        ...(where ? { where } : {}),
        limit: input.limit ?? 10,
        depth: 0,
        sort: '-updatedAt',
        ...(drafts ? { draft: true } : {}),
        overrideAccess: false,
        user: userOf(ctx),
        req,
      })

      const results = await Promise.all(
        (docs as unknown as Record<string, unknown>[]).map(async (doc) => {
          const value = doc[titleField]
          const title = typeof value === 'string' && value !== '' ? value : 'Untitled'
          const id = doc['id'] as number | string
          return {
            id,
            title,
            ...(typeof doc['slug'] === 'string' ? { slug: doc['slug'] } : {}),
            ...(typeof doc['_status'] === 'string' ? { status: doc['_status'] } : {}),
            updatedAt: doc['updatedAt'],
            adminUrl: adminUrl(deps.payload, input.collection, id),
            previewUrl: await previewUrl(deps.payload, input.collection, doc, req),
            ...(q ? { rank: matchRank(title, q) } : {}),
          }
        }),
      )
      // Best title match first when there is a query, newest first within a rank.
      if (q) results.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      return { collection: input.collection, ...(q ? { query: q } : {}), results }
    },
  }
}

/* ------------------------------------------------------------------------ */

const relatedInput = z.object({
  kind: z.string().describe('What to look up, e.g. "people" or "media": a field\'s `findWith`.'),
  query: z.string().optional().describe('A few letters of its name. Omit to list the newest.'),
  where: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe('Exact matches on the fields this kind may be filtered by, e.g. { "type": "topic" }.'),
  limit: z.number().int().positive().max(50).optional().describe('Default: 10.'),
})

/** What an upload result adds: enough to choose an image and describe it. */
function uploadFacts(doc: Record<string, unknown>) {
  const facts: Record<string, unknown> = {}
  for (const key of ['alt', 'filename', 'mimeType', 'width', 'height', 'url']) {
    if (doc[key] !== undefined && doc[key] !== null) facts[key] = doc[key]
  }
  return facts
}

export function createFindRelatedTool(
  deps: ContentToolDeps,
): McpToolDefinition<typeof relatedInput> {
  const canUse = deps.canUse ?? defaultCanUse
  return {
    ...CONTENT_READ_TOOLS.findRelated,
    inputSchema: relatedInput,
    handler: async (input, ctx) => {
      const refused = refusal(ctx, canUse)
      if (refused) return refused
      const kind = deps.related[input.kind]
      if (!kind) {
        return {
          error: `There is no kind "${input.kind}". Kinds: ${Object.keys(deps.related).join(', ') || 'none'}.`,
        }
      }
      const allowed = new Set(kind.filters ?? [])
      const refusedFilters = Object.keys(input.where ?? {}).filter((key) => !allowed.has(key))
      if (refusedFilters.length > 0) {
        return {
          error: `"${input.kind}" cannot be filtered by ${refusedFilters.join(', ')}. It can be filtered by: ${[...allowed].join(', ') || 'nothing'}.`,
        }
      }

      const config = deps.payload.collections[kind.collection as CollectionSlug]?.config
      if (!config) return { error: `The collection behind "${input.kind}" is not configured.` }
      const titleField = titleFieldOf(deps.payload, kind.collection)
      const q = input.query?.trim() ?? ''
      const and: Where[] = Object.entries(input.where ?? {}).map(([key, value]) => ({
        [key]: { equals: value },
      }))
      if (q) {
        const searched = kind.searchFields?.length ? kind.searchFields : [titleField]
        and.push(
          searched.length === 1
            ? { [searched[0]!]: { like: q } }
            : { or: searched.map((field) => ({ [field]: { like: q } })) },
        )
      }

      const { docs } = await deps.payload.find({
        collection: kind.collection as CollectionSlug,
        ...(and.length ? { where: { and } } : {}),
        limit: input.limit ?? 10,
        depth: 0,
        sort: '-updatedAt',
        overrideAccess: false,
        user: userOf(ctx),
      })

      const isUpload = Boolean(config.upload)
      const results = (docs as unknown as Record<string, unknown>[]).map((doc) => {
        const value = doc[titleField]
        const title = typeof value === 'string' && value !== '' ? value : String(doc['id'])
        return {
          id: doc['id'] as number | string,
          title,
          ...Object.fromEntries((kind.filters ?? []).map((key) => [key, doc[key]])),
          ...(isUpload ? uploadFacts(doc) : {}),
          ...(q ? { rank: matchRank(title, q) } : {}),
        }
      })
      if (q) results.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      return { kind: input.kind, collection: kind.collection, results }
    },
  }
}

/* ------------------------------------------------------------------------ */

const getInput = z.object({
  collection: z.string().describe('The content type\'s slug, e.g. "posts".'),
  id: z.union([z.string(), z.number()]).describe('The document id, from find_documents.'),
  draft: z
    .boolean()
    .optional()
    .describe('The latest draft (default), or false for the published version.'),
})

/** The authored fields of a document, as the write tools take them. */
export function toWriteShape(
  doc: Record<string, unknown>,
  fieldNames: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const name of fieldNames) {
    if (doc[name] !== undefined) out[name] = doc[name]
  }
  return out
}

export function createGetDocumentTool(
  deps: ContentToolDeps,
): McpToolDefinition<typeof getInput> {
  const canUse = deps.canUse ?? defaultCanUse
  return {
    ...CONTENT_READ_TOOLS.getDocument,
    inputSchema: getInput,
    handler: async (input, ctx) => {
      const refused = refusal(ctx, canUse)
      if (refused) return refused
      const options = deps.collections[input.collection]
      const config = deps.payload.collections[input.collection as CollectionSlug]?.config
      if (!options || !config) return unknownCollection(deps, input.collection)

      const drafts = Boolean(config.versions && (config.versions as { drafts?: unknown }).drafts)
      const req = await requestAs(deps.payload, ctx)
      const doc = (await deps.payload.findByID({
        collection: input.collection as CollectionSlug,
        id: input.id,
        depth: 0,
        ...(drafts ? { draft: input.draft ?? true } : {}),
        overrideAccess: false,
        user: userOf(ctx),
        disableErrors: true,
        req,
      })) as Record<string, unknown> | null
      if (!doc) {
        return { error: `No ${input.collection} document ${input.id} that you can read.` }
      }

      const names = writableFields(config.fields, options.fields).map(
        (field) => (field as { name: string }).name,
      )
      return {
        collection: input.collection,
        id: doc['id'],
        ...(typeof doc['_status'] === 'string' ? { status: doc['_status'] } : {}),
        updatedAt: doc['updatedAt'],
        adminUrl: adminUrl(deps.payload, input.collection, doc['id'] as number | string),
        previewUrl: await previewUrl(deps.payload, input.collection, doc, req),
        data: toWriteShape(doc, names),
      }
    },
  }
}

export function createContentReadTools(deps: ContentToolDeps): McpToolDefinition[] {
  return [
    createDescribeContentTypeTool(deps),
    createFindDocumentsTool(deps),
    createFindRelatedTool(deps),
    createGetDocumentTool(deps),
  ] as unknown as McpToolDefinition[]
}

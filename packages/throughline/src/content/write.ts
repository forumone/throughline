import { z } from 'zod'
import { ValidationError, type CollectionSlug, type Field, type Payload } from 'payload'
import type { AuditWriter } from '../audit/writer.js'
import type { McpToolContext, McpToolDefinition } from '../plugin-contract/index.js'
import type { McpToolDescriptor } from '../mcp/collector.js'
import { withMeta, type McpMeta } from '../mcp/meta.js'
import { checkSlug, hasSlugField } from '../fields/checkSlug.js'
import { slugify } from '../fields/slug.js'
import { topLevelFields, writableFields } from './describe.js'
import type { RichTextSource } from './options.js'
import {
  compositionErrors,
  disallowedBlocks,
  lockHolder,
  lockRefusal,
  mergePatch,
  refusedFields,
} from './guards.js'
import {
  adminUrl,
  blockRegistry,
  defaultCanUse,
  previewUrl,
  refusal,
  requestAs,
  titleFieldOf,
  unknownCollection,
  userOf,
  type ContentToolDeps,
} from './tools.js'

/*
`create_draft` and `update_draft`: the step between reading the design system
and publishing, which until now only a person in the admin could take.

Drafts only. Every write is `draft: true` and none may carry `_status`, so a
document reaches the public only through the publishing tools — the same gates,
approvals and audit an editor's publish goes through. Each write runs as the
key's person with `overrideAccess: false`, refuses a document somebody has
open, checks the blocks it adds against the picker and the page against the
composition rules, and records itself in the audit log with the caller's
`_meta`.
*/

export const CONTENT_WRITE_TOOLS = {
  createDraft: {
    name: 'create_draft',
    description:
      'Creates a new draft of a content type from the fields `describe_content_type` lists. Never published: the result is a draft with an admin link and a preview link, and going live is publish, schedule_publish or request_approval. A slug is made from the title when none is given, and one already taken (the trash included) is refused with a free alternative. Blocks must be ones the field accepts, and the layout must pass the composition rules.',
  },
  updateDraft: {
    name: 'update_draft',
    description:
      'Changes fields of a document\'s draft, leaving the rest as they are. A group is merged (setting meta.title keeps meta.description); an array or a blocks field is replaced whole. Refused while somebody has the document open in the admin. The published version is untouched until it is published again.',
  },
} as const satisfies Record<string, McpToolDescriptor>

export const CONTENT_WRITE_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] =
  Object.values(CONTENT_WRITE_TOOLS)

export interface ContentWriteDeps extends ContentToolDeps {
  audit?: AuditWriter
}

const metaNote =
  'Why, for the audit log: userPrompt (what was asked), reasoning, changesSummary.'

const createInput = withMeta({
  collection: z.string().describe('The content type\'s slug, e.g. "pages".'),
  data: z
    .record(z.string(), z.unknown())
    .describe('The fields to set, by name, as describe_content_type lists them.'),
}).describe(metaNote)

const updateInput = withMeta({
  collection: z.string().describe('The content type\'s slug, e.g. "pages".'),
  id: z.union([z.string(), z.number()]).describe('The document id.'),
  patch: z
    .record(z.string(), z.unknown())
    .describe('Only the fields to change. A group is merged; an array or blocks field is replaced.'),
}).describe(metaNote)

interface Checked {
  error: string
  [key: string]: unknown
}

/**
 * The checks every write makes on the fields it carries: the allow-list, the
 * blocks each blocks field may hold, and the composition of each blocks field
 * as it will be saved.
 */
async function checkWrite(
  deps: ContentWriteDeps,
  ctx: McpToolContext,
  collection: string,
  data: Record<string, unknown>,
  current: Record<string, unknown>,
): Promise<Checked | undefined> {
  const options = deps.collections[collection]!
  const refused = refusedFields(data, options.fields)
  if (refused.length > 0) {
    return { error: `Cannot set ${refused.map((r) => r.field).join(', ')}.`, refused }
  }

  const config = deps.payload.collections[collection as CollectionSlug]!.config
  const fields = topLevelFields(config.fields)
  const req = await requestAs(deps.payload, ctx)
  const registry = blockRegistry(deps.payload)

  /*
  A draft save skips validation, so a rich-text field handed a Markdown string
  would store the string, and every renderer that expects an editor state would
  fail on the page. So a rich-text value is an editor state, or { markdown } or
  { html } converted here by the site's converter — which refuses rather than
  drops — and nothing else. Converted in place: `data` is what gets saved.
  */
  for (const field of fields) {
    if (field.type !== 'richText' || !(field.name in data)) continue
    const value = data[field.name]
    if (value === null || isEditorState(value)) continue
    const convert = options.richText?.[field.name]
    const source = richTextSource(value)
    if (!convert || !source) {
      return {
        error: convert
          ? `${field.name} takes { markdown: "…" }, { html: "…" }, or an editor state ({ root: … }) as get returns it.`
          : `${field.name} is rich text and takes an editor state ({ root: … }), as get returns it.`,
        field: field.name,
      }
    }
    const converted = await convert(source)
    if ('refused' in converted) {
      return {
        error: `${field.name} could not be converted without losing something: ${converted.refused} Nothing was saved.`,
        field: field.name,
        ...(converted.details !== undefined ? { details: converted.details } : {}),
      }
    }
    data[field.name] = converted.state
  }

  for (const field of blockFields(fields, data)) {
    const rows = data[field.name] as unknown[]
    const currentRows = Array.isArray(current[field.name]) ? (current[field.name] as unknown[]) : []
    const disallowed = await disallowedBlocks(field, rows, currentRows, registry, req)
    if (disallowed.length > 0) {
      return {
        error: `${field.name} does not accept ${disallowed.join(', ')}. get, with only the collection, lists the blocks it does.`,
        field: field.name,
        disallowed,
      }
    }
    const issues = await compositionErrors(deps.payload, rows, deps.composedBlockType)
    if (issues && issues.length > 0) {
      return {
        error: `${field.name} breaks ${issues.length} composition rule${issues.length === 1 ? '' : 's'}. Nothing was saved.`,
        field: field.name,
        issues,
      }
    }
  }
  return undefined
}

/** `{ markdown }` or `{ html }`, and nothing beside it. */
function richTextSource(value: unknown): RichTextSource | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const keys = Object.keys(value)
  if (keys.length !== 1) return undefined
  const v = value as Record<string, unknown>
  if (typeof v['markdown'] === 'string') return { markdown: v['markdown'] }
  if (typeof v['html'] === 'string') return { html: v['html'] }
  return undefined
}

function isEditorState(value: unknown): boolean {
  const root = (value as { root?: unknown } | null)?.root
  return Boolean(root) && typeof root === 'object' && Array.isArray((root as { children?: unknown }).children)
}

/** The top-level blocks fields `data` sets, with an array as their value. */
function blockFields(
  fields: readonly Field[],
  data: Record<string, unknown>,
): Extract<Field, { type: 'blocks' }>[] {
  return fields.filter(
    (field): field is Extract<Field, { type: 'blocks' }> =>
      field.type === 'blocks' && Array.isArray(data[field.name]),
  )
}

/** Payload's refusal of a save, as something an agent can act on. */
function saveRefusal(error: unknown): Checked | undefined {
  if (error instanceof ValidationError) {
    return {
      error: error.message,
      fields: (error.data?.errors ?? []).map((e) => ({ field: e.path, message: e.message })),
    }
  }
  const status = (error as { status?: unknown } | null)?.status
  if (status === 403 || status === 423) {
    return { error: (error as Error).message }
  }
  return undefined
}

async function slugRefusal(
  payload: Payload,
  collection: string,
  slug: string,
): Promise<Checked | undefined> {
  const answer = await checkSlug(payload, collection as CollectionSlug, slug)
  if (answer.available) return undefined
  if (!('takenBy' in answer)) {
    return { error: `"${slug}" cannot be a slug: ${answer.reason ?? 'nothing is left of it'}.` }
  }
  const { takenBy } = answer
  return {
    error: `The slug "${answer.slug}" is taken by "${takenBy.title}"${takenBy.trashed ? ', which is in the trash' : ''}.`,
    takenBy,
    ...(answer.suggestion ? { suggestion: answer.suggestion } : {}),
  }
}

function record(
  deps: ContentWriteDeps,
  ctx: McpToolContext,
  event: {
    action: 'content.create' | 'content.update'
    tool: string
    collection: string
    id: number | string
    title: string | undefined
    changed: readonly string[]
    meta: McpMeta
  },
): Promise<void> {
  if (!deps.audit) return Promise.resolve()
  return deps.audit({
    actor: {
      type: 'user',
      userId: ctx.user ? String(ctx.user.id) : undefined,
      userName: ctx.user?.name ?? ctx.user?.email,
      apiKeyName: ctx.apiKeyName,
      sessionId: ctx.sessionId,
    },
    action: event.action,
    mcpServer: 'content',
    mcpTool: event.tool,
    targetCollection: event.collection,
    targetId: String(event.id),
    targetTitle: event.title,
    prompt: event.meta?.userPrompt,
    reasoning: event.meta?.reasoning,
    changesSummary: event.meta?.changesSummary ?? `Set ${event.changed.join(', ')}.`,
  })
}

function titleIn(payload: Payload, collection: string, doc: Record<string, unknown>) {
  const value = doc[titleFieldOf(payload, collection)]
  return typeof value === 'string' ? value : undefined
}

/* ------------------------------------------------------------------------ */

export function createCreateDraftTool(
  deps: ContentWriteDeps,
): McpToolDefinition<typeof createInput> {
  const canUse = deps.canUse ?? defaultCanUse
  return {
    ...CONTENT_WRITE_TOOLS.createDraft,
    inputSchema: createInput,
    requiredScope: 'content.write',
    handler: async (input, ctx) => {
      const refused = refusal(ctx, canUse)
      if (refused) return refused
      const options = deps.collections[input.collection]
      const config = deps.payload.collections[input.collection as CollectionSlug]?.config
      if (!options || !config) return unknownCollection(deps, input.collection)

      const data = { ...input.data }
      const checked = await checkWrite(deps, ctx, input.collection, data, {})
      if (checked) return checked

      if (hasSlugField(config.fields) && options.fields.includes('slug')) {
        const fromTitle = titleIn(deps.payload, input.collection, data)
        const slug =
          typeof data['slug'] === 'string' && data['slug'].trim() !== ''
            ? data['slug']
            : fromTitle
              ? slugify(fromTitle)
              : ''
        if (!slug) return { error: 'A new document needs a title or a slug.' }
        const taken = await slugRefusal(deps.payload, input.collection, slug)
        if (taken) return taken
        data['slug'] = slugify(slug)
      }

      const req = await requestAs(deps.payload, ctx)
      let doc: Record<string, unknown>
      try {
        doc = (await deps.payload.create({
          collection: input.collection as CollectionSlug,
          data: data as never,
          draft: true,
          depth: 0,
          overrideAccess: false,
          user: userOf(ctx),
          req,
        })) as unknown as Record<string, unknown>
      } catch (error) {
        const answer = saveRefusal(error)
        if (answer) return answer
        throw error
      }

      const id = doc['id'] as number | string
      await record(deps, ctx, {
        action: 'content.create',
        tool: CONTENT_WRITE_TOOLS.createDraft.name,
        collection: input.collection,
        id,
        title: titleIn(deps.payload, input.collection, doc),
        changed: Object.keys(data),
        meta: input._meta,
      })
      return {
        collection: input.collection,
        id,
        status: 'draft',
        ...(typeof doc['slug'] === 'string' ? { slug: doc['slug'] } : {}),
        adminUrl: adminUrl(deps.payload, input.collection, id),
        previewUrl: await previewUrl(deps.payload, input.collection, doc, req),
        next: 'Run `check` before offering to publish.',
      }
    },
  }
}

export function createUpdateDraftTool(
  deps: ContentWriteDeps,
): McpToolDefinition<typeof updateInput> {
  const canUse = deps.canUse ?? defaultCanUse
  return {
    ...CONTENT_WRITE_TOOLS.updateDraft,
    inputSchema: updateInput,
    requiredScope: 'content.write',
    handler: async (input, ctx) => {
      const refused = refusal(ctx, canUse)
      if (refused) return refused
      const options = deps.collections[input.collection]
      const config = deps.payload.collections[input.collection as CollectionSlug]?.config
      if (!options || !config) return unknownCollection(deps, input.collection)
      if (Object.keys(input.patch).length === 0) return { error: 'The patch sets nothing.' }

      const allowlisted = refusedFields(input.patch, options.fields)
      if (allowlisted.length > 0) {
        return {
          error: `Cannot set ${allowlisted.map((r) => r.field).join(', ')}.`,
          refused: allowlisted,
        }
      }

      const opened = await openForWrite(deps, ctx, input.collection, input.id)
      if ('error' in opened) return opened
      const { current } = opened

      const data = mergePatch(
        current,
        input.patch,
        writableFields(config.fields, options.fields),
      )
      const checked = await checkWrite(deps, ctx, input.collection, data, current)
      if (checked) return checked

      if (typeof data['slug'] === 'string' && slugify(data['slug']) !== current['slug']) {
        const taken = await slugRefusal(deps.payload, input.collection, data['slug'])
        if (taken) return taken
        data['slug'] = slugify(data['slug'])
      }

      return saveDraft(deps, ctx, {
        collection: input.collection,
        id: input.id,
        data,
        tool: CONTENT_WRITE_TOOLS.updateDraft.name,
        changed: Object.keys(input.patch),
        meta: input._meta,
      })
    },
  }
}

/**
 * The document's current draft, as the caller may read it — or why not: it is
 * open in the admin, or there is nothing they can read.
 */
export async function openForWrite(
  deps: ContentWriteDeps,
  ctx: McpToolContext,
  collection: string,
  id: number | string,
): Promise<{ current: Record<string, unknown> } | Checked> {
  const lock = await lockHolder(deps.payload, collection, id, ctx.user?.id)
  if (lock) return lockRefusal(collection, id, lock)
  const current = (await deps.payload.findByID({
    collection: collection as CollectionSlug,
    id,
    depth: 0,
    draft: true,
    overrideAccess: false,
    user: userOf(ctx),
    disableErrors: true,
    req: await requestAs(deps.payload, ctx),
  })) as Record<string, unknown> | null
  if (!current) return { error: `No ${collection} document ${id} that you can read.` }
  return { current }
}

/**
 * Saves `data` to the document's draft as the caller, records it, and answers
 * with the links. `data` holds only the top-level fields that change.
 */
export async function saveDraft(
  deps: ContentWriteDeps,
  ctx: McpToolContext,
  write: {
    collection: string
    id: number | string
    data: Record<string, unknown>
    tool: string
    changed: readonly string[]
    meta: McpMeta
  },
): Promise<Record<string, unknown>> {
  const req = await requestAs(deps.payload, ctx)
  let doc: Record<string, unknown>
  try {
    doc = (await deps.payload.update({
      collection: write.collection as CollectionSlug,
      id: write.id,
      data: write.data as never,
      draft: true,
      depth: 0,
      overrideAccess: false,
      overrideLock: false,
      user: userOf(ctx),
      req,
    })) as unknown as Record<string, unknown>
  } catch (error) {
    const answer = saveRefusal(error)
    if (answer) return answer
    throw error
  }

  await record(deps, ctx, {
    action: 'content.update',
    tool: write.tool,
    collection: write.collection,
    id: write.id,
    title: titleIn(deps.payload, write.collection, doc),
    changed: write.changed,
    meta: write.meta,
  })
  return {
    collection: write.collection,
    id: doc['id'],
    status: typeof doc['_status'] === 'string' ? doc['_status'] : 'draft',
    changed: write.changed,
    adminUrl: adminUrl(deps.payload, write.collection, doc['id'] as number | string),
    previewUrl: await previewUrl(deps.payload, write.collection, doc, req),
  }
}

export function createContentWriteTools(deps: ContentWriteDeps): McpToolDefinition[] {
  return [createCreateDraftTool(deps), createUpdateDraftTool(deps)] as unknown as McpToolDefinition[]
}

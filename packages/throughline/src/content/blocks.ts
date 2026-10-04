import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { Block, CollectionSlug, Field } from 'payload'
import type { McpToolContext, McpToolDefinition } from '../plugin-contract/index.js'
import type { McpToolDescriptor } from '../mcp/collector.js'
import { withMeta, type McpMeta } from '../mcp/meta.js'
import { writableFields } from './describe.js'
import { compositionErrors, disallowedBlocks, mergePatch } from './guards.js'
import {
  blockRegistry,
  defaultCanUse,
  refusal,
  requestAs,
  unknownCollection,
} from './tools.js'
import { validateBlock } from './validate.js'
import { openForWrite, saveDraft, type ContentWriteDeps } from './write.js'

/*
One block at a time: insert, change, move or remove a block in a blocks field,
without resending the whole layout.

A blocks field is named by its path: `layout`, or `approach.blocks` for one
inside a group, as a case study's buckets are. Each operation reads the current
draft, makes its one change, and checks the result before saving it: a new
block against the blocks the field offers, a new or changed block against its
own validation (which a draft save would skip), and the field as a whole
against the composition rules. Then it saves the draft as `update_draft` does —
the same lock check, the same audit.
*/

export const CONTENT_BLOCK_TOOLS = {
  insertBlock: {
    name: 'insert_block',
    description:
      'Adds one block to a blocks field of a draft — `layout`, or a field inside a group such as `approach.blocks` — at the end, at the start, or after a given block. The block is { blockType, ...its fields } as get_contract describes it, and is checked against the blocks the field offers, its own validation and the composition rules before anything is saved. Returns the new block\'s id.',
  },
  updateBlock: {
    name: 'update_block',
    description:
      'Changes fields of one block in a draft, by the block\'s id from get_document. A group inside the block is merged; an array is replaced. The block type cannot change: remove it and insert another.',
  },
  moveBlock: {
    name: 'move_block',
    description:
      'Moves one block within its blocks field: to the start, to the end, or after another block. Checked against the composition rules, which care about order.',
  },
  removeBlock: {
    name: 'remove_block',
    description:
      'Removes one block from a draft\'s blocks field, by its id. Checked against the composition rules, since a block may be another\'s required sibling.',
  },
} as const satisfies Record<string, McpToolDescriptor>

export const CONTENT_BLOCK_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] =
  Object.values(CONTENT_BLOCK_TOOLS)

type BlocksField = Extract<Field, { type: 'blocks' }>

/**
 * Every blocks field an author may change, by path: a top-level one by its
 * name, and one inside an allow-listed group as `group.field`.
 */
export function blockFieldPaths(fields: readonly Field[]): Map<string, BlocksField> {
  const out = new Map<string, BlocksField>()
  for (const field of fields) {
    if (field.type === 'blocks') out.set(field.name, field)
    if (field.type === 'group' && 'name' in field && typeof field.name === 'string') {
      for (const inner of field.fields) {
        if (inner.type === 'blocks') out.set(`${field.name}.${inner.name}`, inner)
      }
    }
  }
  return out
}

function rowsAt(doc: Record<string, unknown>, path: string): Record<string, unknown>[] {
  const [head, tail] = path.split('.') as [string, string | undefined]
  const container = tail ? (doc[head] as Record<string, unknown> | undefined) : doc
  const rows = container?.[tail ?? head]
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}

/** The top-level change that puts `rows` at `path`, keeping the rest of a group. */
function dataFor(
  current: Record<string, unknown>,
  path: string,
  rows: Record<string, unknown>[],
): Record<string, unknown> {
  const [head, tail] = path.split('.') as [string, string | undefined]
  if (!tail) return { [head]: rows }
  const group = (current[head] as Record<string, unknown> | undefined) ?? {}
  return { [head]: { ...group, [tail]: rows } }
}

/** Block ids Payload would accept: 24 hex characters, as its own are. */
export function newBlockId(): string {
  return randomBytes(12).toString('hex')
}

function blockConfig(
  field: BlocksField,
  slug: string,
  registry: ReadonlyMap<string, Block>,
): Block | undefined {
  return (
    field.blocks?.find((block) => block.slug === slug) ??
    field.blockReferences
      ?.map((ref) => (typeof ref === 'string' ? registry.get(ref) : ref))
      .find((block): block is Block => block?.slug === slug)
  )
}

const target = {
  collection: z.string().describe('The content type\'s slug, e.g. "pages".'),
  id: z.union([z.string(), z.number()]).describe('The document id.'),
  field: z.string().describe('The blocks field: "layout", or e.g. "approach.blocks".'),
}
const placement = {
  after: z.string().optional().describe('The id of the block to put it after.'),
  position: z.enum(['start', 'end']).optional().describe('Where, when not after a block. Default: end.'),
}

const insertInput = withMeta({
  ...target,
  block: z
    .object({ blockType: z.string() })
    .passthrough()
    .describe('The block: { blockType, ...fields }.'),
  ...placement,
})
const updateInput = withMeta({
  ...target,
  blockId: z.string().describe('The block\'s id, from get_document.'),
  patch: z.record(z.string(), z.unknown()).describe('The block fields to change.'),
})
const moveInput = withMeta({
  ...target,
  blockId: z.string().describe('The block\'s id, from get_document.'),
  ...placement,
})
const removeInput = withMeta({
  ...target,
  blockId: z.string().describe('The block\'s id, from get_document.'),
})

interface Operation {
  collection: string
  id: number | string
  field: string
  _meta?: McpMeta
}

/**
 * What every block tool does around its one change: who may, which field,
 * read the draft, check the result, save it.
 */
async function operate(
  deps: ContentWriteDeps,
  ctx: McpToolContext,
  input: Operation,
  tool: string,
  change: (
    rows: Record<string, unknown>[],
    field: BlocksField,
  ) => Promise<
    | { rows: Record<string, unknown>[]; added?: Record<string, unknown>; summary: string; blockId: string }
    | { error: string; [key: string]: unknown }
  >,
): Promise<Record<string, unknown>> {
  const refused = refusal(ctx, deps.canUse ?? defaultCanUse)
  if (refused) return refused
  const options = deps.collections[input.collection]
  const config = deps.payload.collections[input.collection as CollectionSlug]?.config
  if (!options || !config) return unknownCollection(deps, input.collection)

  const fields = blockFieldPaths(writableFields(config.fields, options.fields))
  const field = fields.get(input.field)
  if (!field) {
    return {
      error: `"${input.field}" is not a blocks field you can change in ${input.collection}. Blocks fields: ${[...fields.keys()].join(', ') || 'none'}.`,
    }
  }

  const opened = await openForWrite(deps, ctx, input.collection, input.id)
  if ('error' in opened) return opened
  const { current } = opened
  const before = rowsAt(current, input.field)

  const changed = await change(before, field)
  if ('error' in changed) return changed

  const req = await requestAs(deps.payload, ctx)
  const registry = blockRegistry(deps.payload)
  if (changed.added) {
    const disallowed = await disallowedBlocks(field, [changed.added], before, registry, req)
    if (disallowed.length > 0) {
      return {
        error: `${input.field} does not accept ${disallowed.join(', ')}. describe_content_type lists the blocks it does.`,
        disallowed,
      }
    }
    const config = blockConfig(field, String(changed.added['blockType']), registry)
    const problems = config
      ? await validateBlock(config.fields, changed.added, {
          data: { ...current, ...dataFor(current, input.field, changed.rows) },
          req,
          collection: input.collection,
          id: input.id,
        })
      : []
    if (problems.length > 0) {
      return {
        error: `The ${String(changed.added['blockType'])} block is not valid. Nothing was saved.`,
        problems,
      }
    }
  }
  const issues = await compositionErrors(deps.payload, changed.rows)
  if (issues && issues.length > 0) {
    return {
      error: `${input.field} would break ${issues.length} composition rule${issues.length === 1 ? '' : 's'}. Nothing was saved.`,
      issues,
    }
  }

  const saved = await saveDraft(deps, ctx, {
    collection: input.collection,
    id: input.id,
    data: dataFor(current, input.field, changed.rows),
    tool,
    changed: [input.field],
    meta: input._meta ?? { changesSummary: changed.summary },
  })
  return 'error' in saved ? saved : { ...saved, field: input.field, blockId: changed.blockId }
}

function indexOf(rows: Record<string, unknown>[], blockId: string): number {
  return rows.findIndex((row) => row['id'] === blockId)
}

function notFound(field: string, blockId: string) {
  return { error: `There is no block "${blockId}" in ${field}. get_document lists the blocks and their ids.` }
}

/** Where a block goes: after another, or at an end. `-1` when `after` names no block. */
function placeAt(
  rows: Record<string, unknown>[],
  placement: { after?: string | undefined; position?: 'start' | 'end' | undefined },
): number {
  if (placement.after !== undefined) {
    const at = indexOf(rows, placement.after)
    return at === -1 ? -1 : at + 1
  }
  return placement.position === 'start' ? 0 : rows.length
}

/* ------------------------------------------------------------------------ */

export function createInsertBlockTool(deps: ContentWriteDeps): McpToolDefinition<typeof insertInput> {
  return {
    ...CONTENT_BLOCK_TOOLS.insertBlock,
    inputSchema: insertInput,
    requiredScope: 'content.write',
    handler: (input, ctx) =>
      operate(deps, ctx, input, CONTENT_BLOCK_TOOLS.insertBlock.name, async (rows) => {
        const at = placeAt(rows, input)
        if (at === -1) return notFound(input.field, input.after!)
        const { id: _ignored, ...fields } = input.block as Record<string, unknown>
        const added = { ...fields, id: newBlockId() }
        return {
          rows: [...rows.slice(0, at), added, ...rows.slice(at)],
          added,
          blockId: added.id,
          summary: `Inserted a ${input.block.blockType} block into ${input.field}.`,
        }
      }),
  }
}

export function createUpdateBlockTool(deps: ContentWriteDeps): McpToolDefinition<typeof updateInput> {
  return {
    ...CONTENT_BLOCK_TOOLS.updateBlock,
    inputSchema: updateInput,
    requiredScope: 'content.write',
    handler: (input, ctx) =>
      operate(deps, ctx, input, CONTENT_BLOCK_TOOLS.updateBlock.name, async (rows, field) => {
        const at = indexOf(rows, input.blockId)
        if (at === -1) return notFound(input.field, input.blockId)
        const row = rows[at]!
        if ('blockType' in input.patch && input.patch['blockType'] !== row['blockType']) {
          return { error: 'A block\'s type cannot change. Remove it and insert another.' }
        }
        if ('id' in input.patch && input.patch['id'] !== row['id']) {
          return { error: 'A block\'s id cannot change.' }
        }
        const config = blockConfig(field, String(row['blockType']), blockRegistry(deps.payload))
        const updated = { ...row, ...mergePatch(row, input.patch, config?.fields ?? []) }
        return {
          rows: rows.map((r, i) => (i === at ? updated : r)),
          // Checked whole, like a new one: a change can make it invalid.
          added: updated,
          blockId: input.blockId,
          summary: `Changed ${Object.keys(input.patch).join(', ')} on a ${String(row['blockType'])} block in ${input.field}.`,
        }
      }),
  }
}

export function createMoveBlockTool(deps: ContentWriteDeps): McpToolDefinition<typeof moveInput> {
  return {
    ...CONTENT_BLOCK_TOOLS.moveBlock,
    inputSchema: moveInput,
    requiredScope: 'content.write',
    handler: (input, ctx) =>
      operate(deps, ctx, input, CONTENT_BLOCK_TOOLS.moveBlock.name, async (rows) => {
        const from = indexOf(rows, input.blockId)
        if (from === -1) return notFound(input.field, input.blockId)
        if (input.after === input.blockId) return { error: 'A block cannot go after itself.' }
        const moving = rows[from]!
        const rest = rows.filter((_, i) => i !== from)
        const at = placeAt(rest, input)
        if (at === -1) return notFound(input.field, input.after!)
        return {
          rows: [...rest.slice(0, at), moving, ...rest.slice(at)],
          blockId: input.blockId,
          summary: `Moved a ${String(moving['blockType'])} block in ${input.field}.`,
        }
      }),
  }
}

export function createRemoveBlockTool(deps: ContentWriteDeps): McpToolDefinition<typeof removeInput> {
  return {
    ...CONTENT_BLOCK_TOOLS.removeBlock,
    inputSchema: removeInput,
    requiredScope: 'content.write',
    handler: (input, ctx) =>
      operate(deps, ctx, input, CONTENT_BLOCK_TOOLS.removeBlock.name, async (rows) => {
        const at = indexOf(rows, input.blockId)
        if (at === -1) return notFound(input.field, input.blockId)
        return {
          rows: rows.filter((_, i) => i !== at),
          blockId: input.blockId,
          summary: `Removed a ${String(rows[at]!['blockType'])} block from ${input.field}.`,
        }
      }),
  }
}

export function createContentBlockTools(deps: ContentWriteDeps): McpToolDefinition[] {
  return [
    createInsertBlockTool(deps),
    createUpdateBlockTool(deps),
    createMoveBlockTool(deps),
    createRemoveBlockTool(deps),
  ] as unknown as McpToolDefinition[]
}

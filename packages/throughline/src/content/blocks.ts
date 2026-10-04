import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { Block, CollectionSlug, Field } from 'payload'
import type { McpToolContext, McpToolDefinition } from '../plugin-contract/index.js'
import type { McpToolDescriptor } from '../mcp/collector.js'
import { withMeta, type McpMeta } from '../mcp/meta.js'
import { writableFields } from './describe.js'
import { compositionErrors, disallowedBlocks, mergePatch } from './guards.js'
import { blockRegistry, defaultCanUse, refusal, requestAs, unknownCollection } from './tools.js'
import { validateBlock } from './validate.js'
import { checkValues, valueRefusal } from './values.js'
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
      "Adds one block to a blocks field of a draft — `layout`, or a field inside a group such as `approach.blocks` — at the end, at the start, or after a given block. The block is { blockType, ...its fields } as get_contract describes it, and is checked against the blocks the field offers, its own validation and the composition rules before anything is saved. Returns the new block's id.",
  },
  updateBlock: {
    name: 'update_block',
    description:
      "Changes fields of one block in a draft, by the block's id from get_document. A group inside the block is merged; an array is replaced. The block type cannot change: remove it and insert another.",
  },
  moveBlock: {
    name: 'move_block',
    description:
      'Moves one block within its blocks field: to the start, to the end, or after another block. Checked against the composition rules, which care about order.',
  },
  removeBlock: {
    name: 'remove_block',
    description:
      "Removes one block from a draft's blocks field, by its id. Checked against the composition rules, since a block may be another's required sibling.",
  },
  editBlocks: {
    name: 'edit_blocks',
    description:
      'Changes the blocks in one blocks field of a draft (`layout`, or e.g. `approach.blocks`): insert, update, move and remove, as a list applied in order and saved together. Each new or changed block is checked against what the field accepts and its own validation, and the result against the composition rules, before anything is saved. Block ids come from get. To replace the whole field, use save_draft.',
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
  position: z
    .enum(['start', 'end'])
    .optional()
    .describe('Where, when not after a block. Default: end.'),
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
  blockId: z.string().describe("The block's id, from get_document."),
  patch: z.record(z.string(), z.unknown()).describe('The block fields to change.'),
})
const moveInput = withMeta({
  ...target,
  blockId: z.string().describe("The block's id, from get_document."),
  ...placement,
})
const removeInput = withMeta({
  ...target,
  blockId: z.string().describe("The block's id, from get_document."),
})

interface Operation {
  collection: string
  id: number | string
  field: string
  _meta?: McpMeta
}

type Rows = Record<string, unknown>[]
type Placement = { after?: string | undefined; position?: 'start' | 'end' | undefined }

/** One change to a blocks field's rows: the new rows, and what it added or changed. */
type Change = (
  rows: Rows,
  field: BlocksField,
) => Promise<
  | { rows: Rows; added?: Record<string, unknown>; summary: string; blockId: string }
  | { error: string; [key: string]: unknown }
>

/**
 * What every block operation does around its changes: who may, which field,
 * read the draft, check the result, save it.
 *
 * The changes apply in order, each to the rows the one before left, and the
 * result is checked and saved once. So `edit_blocks` can remove a block and
 * insert its replacement without the field being saved, or checked against
 * the composition rules, halfway. A single-block tool is the same thing with
 * one change. A block a later change removes is not validated, because it is
 * not in what gets saved.
 */
async function operate(
  deps: ContentWriteDeps,
  ctx: McpToolContext,
  input: Operation,
  tool: string,
  changes: readonly Change[],
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

  let rows = before
  const touched = new Map<string, Record<string, unknown>>()
  const summaries: string[] = []
  const blockIds: string[] = []
  for (const [index, change] of changes.entries()) {
    const changed = await change(rows, field)
    if ('error' in changed) {
      return changes.length === 1
        ? changed
        : {
            ...changed,
            operation: index,
            error: `Operation ${index}: ${changed.error} Nothing was saved.`,
          }
    }
    rows = changed.rows
    if (changed.added) touched.set(String(changed.added['id']), changed.added)
    summaries.push(changed.summary)
    blockIds.push(changed.blockId)
  }

  const req = await requestAs(deps.payload, ctx)
  const registry = blockRegistry(deps.payload)
  const kept = [...touched.values()].filter((row) => rows.some((r) => r['id'] === row['id']))
  // Each new or changed block's values in the shape their fields take, converting nested rich text. #832.
  for (const row of kept) {
    const config = blockConfig(field, String(row['blockType']), registry)
    if (!config) continue
    const problems = await checkValues(
      config.fields,
      row,
      { registry, ...(deps.blockRichText ? { blockRichText: deps.blockRichText } : {}) },
      `${input.field}[${rows.findIndex((r) => r['id'] === row['id'])}]`,
    )
    if (problems.length > 0) return valueRefusal(problems)
  }
  for (const row of kept) {
    const disallowed = await disallowedBlocks(field, [row], before, registry, req)
    if (disallowed.length > 0) {
      return {
        error: `${input.field} does not accept ${disallowed.join(', ')}. get, with only the collection, lists the blocks it does.`,
        disallowed,
      }
    }
    const config = blockConfig(field, String(row['blockType']), registry)
    const problems = config
      ? await validateBlock(config.fields, row, {
          data: { ...current, ...dataFor(current, input.field, rows) },
          req,
          collection: input.collection,
          id: input.id,
        })
      : []
    if (problems.length > 0) {
      return {
        error: `The ${String(row['blockType'])} block is not valid. Nothing was saved.`,
        problems,
      }
    }
  }
  const issues = await compositionErrors(deps.payload, rows, deps.composedBlockType)
  if (issues && issues.length > 0) {
    return {
      error: `${input.field} would break ${issues.length} composition rule${issues.length === 1 ? '' : 's'}. Nothing was saved.`,
      issues,
    }
  }

  const saved = await saveDraft(deps, ctx, {
    collection: input.collection,
    id: input.id,
    data: dataFor(current, input.field, rows),
    tool,
    changed: [input.field],
    meta: input._meta ?? { changesSummary: summaries.join(' ') },
  })
  if ('error' in saved) return saved
  return changes.length === 1
    ? { ...saved, field: input.field, blockId: blockIds[0] }
    : { ...saved, field: input.field, blockIds }
}

function indexOf(rows: Rows, blockId: string): number {
  return rows.findIndex((row) => row['id'] === blockId)
}

function notFound(field: string, blockId: string) {
  return {
    error: `There is no block "${blockId}" in ${field}. get lists the blocks and their ids.`,
  }
}

/** Where a block goes: after another, or at an end. `-1` when `after` names no block. */
function placeAt(rows: Rows, placement: Placement): number {
  if (placement.after !== undefined) {
    const at = indexOf(rows, placement.after)
    return at === -1 ? -1 : at + 1
  }
  return placement.position === 'start' ? 0 : rows.length
}

function insertChange(fieldPath: string, op: { block: { blockType: string } } & Placement): Change {
  return async (rows) => {
    const at = placeAt(rows, op)
    if (at === -1) return notFound(fieldPath, op.after!)
    const { id: _ignored, ...fields } = op.block as Record<string, unknown>
    const added = { ...fields, id: newBlockId() }
    return {
      rows: [...rows.slice(0, at), added, ...rows.slice(at)],
      added,
      blockId: added.id,
      summary: `Inserted a ${op.block.blockType} block into ${fieldPath}.`,
    }
  }
}

function updateChange(
  deps: ContentWriteDeps,
  fieldPath: string,
  op: { blockId: string; patch: Record<string, unknown> },
): Change {
  return async (rows, field) => {
    const at = indexOf(rows, op.blockId)
    if (at === -1) return notFound(fieldPath, op.blockId)
    const row = rows[at]!
    if ('blockType' in op.patch && op.patch['blockType'] !== row['blockType']) {
      return { error: "A block's type cannot change. Remove it and insert another." }
    }
    if ('id' in op.patch && op.patch['id'] !== row['id']) {
      return { error: "A block's id cannot change." }
    }
    const config = blockConfig(field, String(row['blockType']), blockRegistry(deps.payload))
    const updated = { ...row, ...mergePatch(row, op.patch, config?.fields ?? []) }
    return {
      rows: rows.map((r, i) => (i === at ? updated : r)),
      // Checked whole, like a new one: a change can make it invalid.
      added: updated,
      blockId: op.blockId,
      summary: `Changed ${Object.keys(op.patch).join(', ')} on a ${String(row['blockType'])} block in ${fieldPath}.`,
    }
  }
}

function moveChange(fieldPath: string, op: { blockId: string } & Placement): Change {
  return async (rows) => {
    const from = indexOf(rows, op.blockId)
    if (from === -1) return notFound(fieldPath, op.blockId)
    if (op.after === op.blockId) return { error: 'A block cannot go after itself.' }
    const moving = rows[from]!
    const rest = rows.filter((_, i) => i !== from)
    const at = placeAt(rest, op)
    if (at === -1) return notFound(fieldPath, op.after!)
    return {
      rows: [...rest.slice(0, at), moving, ...rest.slice(at)],
      blockId: op.blockId,
      summary: `Moved a ${String(moving['blockType'])} block in ${fieldPath}.`,
    }
  }
}

function removeChange(fieldPath: string, op: { blockId: string }): Change {
  return async (rows) => {
    const at = indexOf(rows, op.blockId)
    if (at === -1) return notFound(fieldPath, op.blockId)
    return {
      rows: rows.filter((_, i) => i !== at),
      blockId: op.blockId,
      summary: `Removed a ${String(rows[at]!['blockType'])} block from ${fieldPath}.`,
    }
  }
}

/* ------------------------------------------------------------------------ */

export function createInsertBlockTool(
  deps: ContentWriteDeps,
): McpToolDefinition<typeof insertInput> {
  return {
    ...CONTENT_BLOCK_TOOLS.insertBlock,
    inputSchema: insertInput,
    requiredScope: 'content.write',
    handler: (input, ctx) =>
      operate(deps, ctx, input, CONTENT_BLOCK_TOOLS.insertBlock.name, [
        insertChange(input.field, input),
      ]),
  }
}

export function createUpdateBlockTool(
  deps: ContentWriteDeps,
): McpToolDefinition<typeof updateInput> {
  return {
    ...CONTENT_BLOCK_TOOLS.updateBlock,
    inputSchema: updateInput,
    requiredScope: 'content.write',
    handler: (input, ctx) =>
      operate(deps, ctx, input, CONTENT_BLOCK_TOOLS.updateBlock.name, [
        updateChange(deps, input.field, input),
      ]),
  }
}

export function createMoveBlockTool(deps: ContentWriteDeps): McpToolDefinition<typeof moveInput> {
  return {
    ...CONTENT_BLOCK_TOOLS.moveBlock,
    inputSchema: moveInput,
    requiredScope: 'content.write',
    handler: (input, ctx) =>
      operate(deps, ctx, input, CONTENT_BLOCK_TOOLS.moveBlock.name, [
        moveChange(input.field, input),
      ]),
  }
}

export function createRemoveBlockTool(
  deps: ContentWriteDeps,
): McpToolDefinition<typeof removeInput> {
  return {
    ...CONTENT_BLOCK_TOOLS.removeBlock,
    inputSchema: removeInput,
    requiredScope: 'content.write',
    handler: (input, ctx) =>
      operate(deps, ctx, input, CONTENT_BLOCK_TOOLS.removeBlock.name, [
        removeChange(input.field, input),
      ]),
  }
}

const blockOperation = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('insert'),
    block: z
      .object({ blockType: z.string() })
      .passthrough()
      .describe("The block: { blockType, ...fields }, as the component's contract describes it."),
    ...placement,
  }),
  z.object({
    op: z.literal('update'),
    blockId: z.string().describe("The block's id, as the document lists it."),
    patch: z
      .record(z.string(), z.unknown())
      .describe('The block fields to change. A group is merged; an array is replaced.'),
  }),
  z.object({
    op: z.literal('move'),
    blockId: z.string().describe("The block's id, as the document lists it."),
    ...placement,
  }),
  z.object({
    op: z.literal('remove'),
    blockId: z.string().describe("The block's id, as the document lists it."),
  }),
])

export const editBlocksInput = withMeta({
  ...target,
  operations: z
    .array(blockOperation)
    .min(1)
    .max(50)
    .describe(
      'Applied in order, each to the result of the one before, then checked and saved once. If any fails, nothing is saved.',
    ),
})

/**
 * Several block operations on one field, checked and saved as one: the four
 * single-block tools, as a list. forumone-2026#830.
 */
export function createEditBlocksTool(
  deps: ContentWriteDeps,
): McpToolDefinition<typeof editBlocksInput> {
  return {
    ...CONTENT_BLOCK_TOOLS.editBlocks,
    inputSchema: editBlocksInput,
    requiredScope: 'content.write',
    handler: (input, ctx) =>
      operate(
        deps,
        ctx,
        input,
        CONTENT_BLOCK_TOOLS.editBlocks.name,
        input.operations.map((op): Change => {
          switch (op.op) {
            case 'insert':
              return insertChange(input.field, op)
            case 'update':
              return updateChange(deps, input.field, op)
            case 'move':
              return moveChange(input.field, op)
            case 'remove':
              return removeChange(input.field, op)
          }
        }),
      ),
  }
}

export function createContentBlockTools(deps: ContentWriteDeps): McpToolDefinition[] {
  return [
    createInsertBlockTool(deps),
    createUpdateBlockTool(deps),
    createMoveBlockTool(deps),
    createRemoveBlockTool(deps),
    createEditBlocksTool(deps),
  ] as unknown as McpToolDefinition[]
}

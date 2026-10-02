import type { Block, CollectionSlug, Field } from 'payload'

/*
Which references to a collection one document holds, found by walking its field
config alongside its data.

Moved from forumone-2026 (`media/usage.ts`, #591 there), and general now: the
site already asked it about people, clients and taxonomy terms as well as media.

## Why this cannot be a query

With `blocksAsJSON: true`, an upload inside a block is an integer in a JSONB
column and nothing else: no `_rels` row and no foreign key. So Payload cannot
answer "what uses this image?", and neither can a `where` clause. Deleting the
image succeeds silently, the id dangles in the JSON, the relation populates as
null on read, and the image is simply absent from the page. A field outside a
block is little better: its foreign key is `ON DELETE set null`, which is
differently silent rather than safe.

## Why a walker and not a string search

`layout::text LIKE '%5%'` is wrong in both directions: `5` is also a column
count, a heading level and a year. A false positive refuses a delete nobody can
then perform; a false negative is the silent failure this exists to stop. So
the walk is structural. It descends the field config alongside the data and
reads a value only when the field it arrived at is an upload or relationship
pointing at the collection in question. A number anywhere else is a number.

It needs no list of field names, either. A block that gains an image gains it
here, because the block config is the thing being walked.

## What it covers

- Uploads and relationships, single or `hasMany`, bare ids, populated documents
  and polymorphic `{ relationTo, value }`.
- `group`, `array`, `blocks`, both kinds of `tabs`, and the unnamed wrappers
  (`row`, `collapsible`) whose children share the parent's data object.
- Blocks from the field's own `blocks`, from `blockReferences`, and from the
  config's `blocks` registry by slug.
- Rich text: Lexical `upload` and `relationship` nodes, and `block` and
  `inlineBlock` nodes, whose fields are walked as the block they name. The
  site's version found only uploads, so an image inside a block in an article
  body was invisible to it.
*/

/** One reference, and enough to say where it is. */
export interface Reference {
  /** The referenced document's id, as it appears in the data. */
  id: number | string
  /** A human-readable path: `layout[3] › ImageHero › image`. */
  path: string
  /**
   * Whether the reference is inside a block, and so has no foreign key.
   * A `false` is one the database will null out on delete; a `true` is one it
   * does not know exists.
   */
  viaBlock: boolean
}

export interface ReferencesInOptions {
  /** The collection whose documents are being looked for. */
  collection: CollectionSlug
  /**
   * Blocks to resolve by slug: the config's `blocks` registry, for
   * `blockReferences` and Lexical block nodes, plus any extras. A `blocks`
   * field's own blocks are always used and need not be listed.
   */
  blocks?: readonly Block[] | ReadonlyMap<string, Block>
}

type NamedField = Field & { name: string }

function isNamed(field: Field): field is NamedField {
  return 'name' in field && typeof (field as { name?: unknown }).name === 'string'
}

function childrenOf(field: Field): Field[] {
  return 'fields' in field && Array.isArray(field.fields) ? field.fields : []
}

/**
 * The id out of a relationship value. An id at `depth: 0`, a populated object
 * above it. `String({ id: 3 })` is `[object Object]`, which matches nothing and
 * fails open, so the object case is handled rather than coerced.
 */
function idOf(value: unknown): number | string | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const { id } = value
    if (typeof id === 'number' || typeof id === 'string') return id
  }
  return undefined
}

/** Whether an upload or relationship field can point at `collection`. */
export function pointsAt(field: Field, collection: CollectionSlug): boolean {
  if (field.type !== 'upload' && field.type !== 'relationship') return false
  const { relationTo } = field as { relationTo?: unknown }
  return Array.isArray(relationTo) ? relationTo.includes(collection) : relationTo === collection
}

/** Every id out of a relationship value that points at `collection`. */
function idsIn(value: unknown, collection: CollectionSlug): (number | string)[] {
  const entries: unknown[] = Array.isArray(value) ? value : [value]
  const ids: (number | string)[] = []
  for (const entry of entries) {
    if (entry && typeof entry === 'object' && 'relationTo' in entry && 'value' in entry) {
      // Polymorphic: counts only when it names the collection.
      if (entry.relationTo !== collection) continue
      const id = idOf(entry.value)
      if (id !== undefined) ids.push(id)
      continue
    }
    const id = idOf(entry)
    if (id !== undefined) ids.push(id)
  }
  return ids
}

interface WalkContext {
  collection: CollectionSlug
  registry: ReadonlyMap<string, Block>
  out: Reference[]
}

/** The blocks a `blocks` field can hold, by slug. */
function blocksOf(field: Field, registry: ReadonlyMap<string, Block>): Map<string, Block> {
  const own = new Map<string, Block>()
  const { blocks, blockReferences } = field as {
    blocks?: unknown
    blockReferences?: unknown
  }
  if (Array.isArray(blocks)) {
    for (const block of blocks as Block[]) own.set(block.slug, block)
  }
  if (Array.isArray(blockReferences)) {
    for (const ref of blockReferences as (string | Block)[]) {
      const block = typeof ref === 'string' ? registry.get(ref) : ref
      if (block) own.set(block.slug, block)
    }
  }
  return own
}

/**
 * Rich text: `upload` nodes, and `block` / `inlineBlock` nodes walked as the
 * block they name. Shape-matched rather than typed against Lexical's node
 * union, because the column was written by whatever editor version was current.
 */
function walkRichText(value: unknown, path: string, viaBlock: boolean, ctx: WalkContext): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const entry of value) walkRichText(entry, path, viaBlock, ctx)
    return
  }

  const node = value as Record<string, unknown>
  const embedded =
    node['type'] === 'upload'
      ? 'embedded upload'
      : node['type'] === 'relationship'
        ? 'embedded link'
        : undefined
  if (embedded && node['relationTo'] === ctx.collection) {
    const id = idOf(node['value'])
    if (id !== undefined) ctx.out.push({ id, path: `${path} › ${embedded}`, viaBlock })
  }

  if (node['type'] === 'block' || node['type'] === 'inlineBlock') {
    const fields = node['fields'] as Record<string, unknown> | undefined
    const slug = typeof fields?.['blockType'] === 'string' ? fields['blockType'] : undefined
    const block = slug ? ctx.registry.get(slug) : undefined
    // An unknown block is skipped rather than guessed at, as in a `blocks` field.
    if (block && fields) walkFields(block.fields, fields, `${path} › ${block.slug}`, true, ctx)
  }

  for (const key of ['root', 'children']) {
    if (key in node) walkRichText(node[key], path, viaBlock, ctx)
  }
}

function walkFields(
  fields: readonly Field[],
  data: Record<string, unknown> | undefined,
  path: string,
  viaBlock: boolean,
  ctx: WalkContext,
): void {
  if (!data) return

  for (const field of fields) {
    // Unnamed wrappers hold their children under the *parent's* data object.
    if (!isNamed(field)) {
      if (field.type === 'tabs' && 'tabs' in field && Array.isArray(field.tabs)) {
        for (const tab of field.tabs) {
          const named = 'name' in tab && typeof tab.name === 'string' ? tab.name : undefined
          const nested = named ? (data[named] as Record<string, unknown> | undefined) : data
          const here = named ? `${path}${path ? ' › ' : ''}${named}` : path
          walkFields(tab.fields, nested, here, viaBlock, ctx)
        }
        continue
      }
      walkFields(childrenOf(field), data, path, viaBlock, ctx)
      continue
    }

    const value = data[field.name]
    if (value === undefined || value === null) continue
    const here = path ? `${path} › ${field.name}` : field.name

    if (pointsAt(field, ctx.collection)) {
      for (const id of idsIn(value, ctx.collection)) ctx.out.push({ id, path: here, viaBlock })
      continue
    }

    switch (field.type) {
      case 'richText':
        walkRichText(value, here, viaBlock, ctx)
        break

      case 'group':
        walkFields(childrenOf(field), value as Record<string, unknown>, here, viaBlock, ctx)
        break

      case 'array':
        if (Array.isArray(value)) {
          value.forEach((row, index) => {
            walkFields(
              childrenOf(field),
              row as Record<string, unknown>,
              `${here}[${index}]`,
              viaBlock,
              ctx,
            )
          })
        }
        break

      case 'blocks': {
        if (!Array.isArray(value)) break
        const own = blocksOf(field, ctx.registry)
        value.forEach((row, index) => {
          const entry = row as Record<string, unknown>
          const slug = typeof entry['blockType'] === 'string' ? entry['blockType'] : undefined
          const block = slug ? (own.get(slug) ?? ctx.registry.get(slug)) : undefined
          /*
          A row whose `blockType` names no known block is skipped rather than
          guessed at: the config and the data disagree, and inventing a field
          list for it would be the string-search failure by another route.
          */
          if (!block) return
          walkFields(block.fields, entry, `${here}[${index}] › ${block.slug}`, true, ctx)
        })
        break
      }

      default:
        break
    }
  }
}

function registryOf(blocks: ReferencesInOptions['blocks']): ReadonlyMap<string, Block> {
  if (!blocks) return new Map()
  if (blocks instanceof Map) return blocks
  return new Map((blocks as readonly Block[]).map((block) => [block.slug, block]))
}

/**
 * Every reference to `collection` inside one document. Pure: it takes the field
 * config and the data and touches nothing, so the whole decision is testable
 * without a database.
 */
export function referencesIn(
  fields: readonly Field[],
  data: Record<string, unknown> | undefined,
  options: ReferencesInOptions,
): Reference[] {
  const out: Reference[] = []
  walkFields(fields, data, '', false, {
    collection: options.collection,
    registry: registryOf(options.blocks),
    out,
  })
  return out
}

/** The references to one document, comparing ids as strings. */
export function referencesTo(
  fields: readonly Field[],
  data: Record<string, unknown> | undefined,
  options: ReferencesInOptions & { id: number | string },
): Reference[] {
  return referencesIn(fields, data, options).filter(
    (reference) => String(reference.id) === String(options.id),
  )
}

/**
 * Whether a field tree could hold a reference to `collection` at all: a field
 * pointing at it, a `blocks` field, or rich text. Decided from the config
 * rather than from a list, so a collection that gains an image is covered.
 */
export function couldReference(fields: readonly Field[], collection: CollectionSlug): boolean {
  for (const field of fields) {
    if (pointsAt(field, collection)) return true
    if (field.type === 'blocks' || field.type === 'richText') return true
    if (field.type === 'tabs' && 'tabs' in field && Array.isArray(field.tabs)) {
      if (field.tabs.some((tab) => couldReference(tab.fields, collection))) return true
      continue
    }
    if (couldReference(childrenOf(field), collection)) return true
  }
  return false
}

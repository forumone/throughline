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

## One walk, several questions

The nesting above is `walkDocument`, which calls a visitor at every field and
every rich-text node. `referencesIn` asks it about one collection;
`linkTargetsIn` (`./links.ts`) asks it where a document's links go, for the
publish pipeline's `link-targets` step. Each says what it is looking for, and
neither restates how the shapes nest.
*/

/** One reference, and enough to say where it is. */
export interface Reference {
  /** The referenced document's id, as it appears in the data. */
  id: number | string
  /** A human-readable path: `layout[3] › ImageHero › image`. */
  path: string
  /**
   * The data path, `layout[3].image`, from which `findReferences` says where
   * the reference is in the editor's words. Inside rich text, the rich-text
   * field's own path.
   */
  dataPath: string
  /**
   * Whether the reference is inside a block, and so has no foreign key.
   * A `false` is one the database will null out on delete; a `true` is one it
   * does not know exists.
   */
  viaBlock: boolean
  /**
   * Where it is, as the edit view labels it: `Block 4 (Image Hero) › Image`.
   * Filled in by `findReferences`, which has the config to read labels from.
   */
  where?: string
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

export type NamedField = Field & { name: string }

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
export function idOf(value: unknown): number | string | undefined {
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

/** Where the walk is, as a visitor sees it. */
export interface WalkLocation {
  /** A human-readable path: `layout[3] › ImageHero › image`. */
  path: string
  /**
   * The data path in the form the publish checks report: `layout[3].image`.
   * Inside rich text it stays the rich-text field's own path, because nothing
   * inside the editor state is a field the admin can mark.
   */
  dataPath: string
  /** Whether the walk is inside a block, and so past any foreign key. */
  viaBlock: boolean
  /** The outermost `blocks` row the walk is inside: its index and its config. */
  block?: { index: number; block: Block } | undefined
  /** The top-level field, or named tab, the walk is under. */
  top?: { name: string; label?: unknown } | undefined
  /** Whether the walk is inside rich text. */
  inRichText: boolean
}

/**
 * What a walk does at each stop. Both are optional; a visitor that implements
 * neither walks the document and learns nothing.
 */
export interface WalkVisitor {
  /**
   * Every named field that holds a value, with the data object it sits in.
   * Return `true` to keep the walk out of the value — a relationship that has
   * been read should not be walked as though it were a group.
   */
  field?: (
    field: NamedField,
    value: unknown,
    siblings: Record<string, unknown>,
    at: WalkLocation,
  ) => boolean | void
  /** Every Lexical node, at the location of the rich-text field it is in. */
  richTextNode?: (node: Record<string, unknown>, at: WalkLocation) => void
}

export interface WalkDocumentOptions {
  /** As `ReferencesInOptions.blocks`. */
  blocks?: readonly Block[] | ReadonlyMap<string, Block>
}

interface Walk {
  registry: ReadonlyMap<string, Block>
  visitor: WalkVisitor
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

/** `here` one step down into `name`, in both path forms. */
function into(at: WalkLocation, name: string): WalkLocation {
  return {
    ...at,
    path: at.path ? `${at.path} › ${name}` : name,
    dataPath: at.inRichText ? at.dataPath : at.dataPath ? `${at.dataPath}.${name}` : name,
  }
}

/**
 * Rich text: every node goes to the visitor, and `block` / `inlineBlock` nodes
 * are walked as the block they name. Shape-matched rather than typed against
 * Lexical's node union, because the column was written by whatever editor
 * version was current.
 */
function walkRichText(value: unknown, at: WalkLocation, walk: Walk): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const entry of value) walkRichText(entry, at, walk)
    return
  }

  const node = value as Record<string, unknown>
  walk.visitor.richTextNode?.(node, at)

  if (node['type'] === 'block' || node['type'] === 'inlineBlock') {
    const fields = node['fields'] as Record<string, unknown> | undefined
    const slug = typeof fields?.['blockType'] === 'string' ? fields['blockType'] : undefined
    const block = slug ? walk.registry.get(slug) : undefined
    // An unknown block is skipped rather than guessed at, as in a `blocks` field.
    if (block && fields) {
      walkFields(
        block.fields,
        fields,
        { ...at, path: `${at.path} › ${block.slug}`, viaBlock: true, inRichText: true },
        walk,
      )
    }
  }

  for (const key of ['root', 'children']) {
    if (key in node) walkRichText(node[key], at, walk)
  }
}

function walkFields(
  fields: readonly Field[],
  data: Record<string, unknown> | undefined,
  at: WalkLocation,
  walk: Walk,
): void {
  if (!data) return

  for (const field of fields) {
    // Unnamed wrappers hold their children under the *parent's* data object.
    if (!isNamed(field)) {
      if (field.type === 'tabs' && 'tabs' in field && Array.isArray(field.tabs)) {
        for (const tab of field.tabs) {
          const named = 'name' in tab && typeof tab.name === 'string' ? tab.name : undefined
          if (!named) {
            walkFields(tab.fields, data, at, walk)
            continue
          }
          const here = into(at, named)
          walkFields(
            tab.fields,
            data[named] as Record<string, unknown> | undefined,
            { ...here, top: at.top ?? { name: named, label: tab.label } },
            walk,
          )
        }
        continue
      }
      walkFields(childrenOf(field), data, at, walk)
      continue
    }

    const value = data[field.name]
    if (value === undefined || value === null) continue
    const here: WalkLocation = {
      ...into(at, field.name),
      top: at.top ?? { name: field.name, label: (field as { label?: unknown }).label },
    }

    if (walk.visitor.field?.(field, value, data, here) === true) continue

    switch (field.type) {
      case 'richText':
        walkRichText(value, here, walk)
        break

      case 'group':
        walkFields(childrenOf(field), value as Record<string, unknown>, here, walk)
        break

      case 'array':
        if (Array.isArray(value)) {
          value.forEach((row, index) => {
            walkFields(
              childrenOf(field),
              row as Record<string, unknown>,
              {
                ...here,
                path: `${here.path}[${index}]`,
                dataPath: here.inRichText ? here.dataPath : `${here.dataPath}[${index}]`,
              },
              walk,
            )
          })
        }
        break

      case 'blocks': {
        if (!Array.isArray(value)) break
        const own = blocksOf(field, walk.registry)
        value.forEach((row, index) => {
          const entry = row as Record<string, unknown>
          const slug = typeof entry['blockType'] === 'string' ? entry['blockType'] : undefined
          const block = slug ? (own.get(slug) ?? walk.registry.get(slug)) : undefined
          /*
          A row whose `blockType` names no known block is skipped rather than
          guessed at: the config and the data disagree, and inventing a field
          list for it would be the string-search failure by another route.
          */
          if (!block) return
          walkFields(
            block.fields,
            entry,
            {
              ...here,
              path: `${here.path}[${index}] › ${block.slug}`,
              dataPath: here.inRichText ? here.dataPath : `${here.dataPath}[${index}]`,
              viaBlock: true,
              block: here.block ?? { index, block },
            },
            walk,
          )
        })
        break
      }

      default:
        break
    }
  }
}

function registryOf(blocks: WalkDocumentOptions['blocks']): ReadonlyMap<string, Block> {
  if (!blocks) return new Map()
  if (blocks instanceof Map) return blocks
  return new Map((blocks as readonly Block[]).map((block) => [block.slug, block]))
}

/**
 * Walks one document's data alongside its field config, calling the visitor at
 * every field and every rich-text node. The structure `referencesIn` and
 * `linkTargetsIn` share: each says what it is looking for, and neither restates
 * how groups, tabs, arrays, blocks and rich text nest.
 */
export function walkDocument(
  fields: readonly Field[],
  data: Record<string, unknown> | undefined,
  visitor: WalkVisitor,
  options: WalkDocumentOptions = {},
): void {
  walkFields(
    fields,
    data,
    { path: '', dataPath: '', viaBlock: false, inRichText: false },
    { registry: registryOf(options.blocks), visitor },
  )
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
  const { collection } = options
  walkDocument(
    fields,
    data,
    {
      field(field, value, _siblings, at) {
        if (!pointsAt(field, collection)) return false
        for (const id of idsIn(value, collection)) {
          out.push({ id, path: at.path, dataPath: at.dataPath, viaBlock: at.viaBlock })
        }
        return true
      },
      richTextNode(node, at) {
        const embedded =
          node['type'] === 'upload'
            ? 'embedded upload'
            : node['type'] === 'relationship'
              ? 'embedded link'
              : undefined
        if (!embedded || node['relationTo'] !== collection) return
        const id = idOf(node['value'])
        if (id !== undefined) {
          out.push({
            id,
            path: `${at.path} › ${embedded}`,
            dataPath: at.dataPath,
            viaBlock: at.viaBlock,
          })
        }
      },
    },
    options,
  )
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

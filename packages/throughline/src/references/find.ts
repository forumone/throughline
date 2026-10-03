import type { Block, CollectionSlug, Field, Payload, PayloadRequest } from 'payload'
import { couldReference, referencesIn, type Reference } from './walk.js'

/*
Which documents reference a given one, across the whole config.

The walk in `./walk.ts` is pure. This is the part that reads rows, and its cost
is worth stating plainly.

## Why it reads everything

With blocks stored as JSON there is nothing to join and nothing to put in a
`where`, so the read is a full scan of every collection and global that *could*
hold a reference, narrowed three ways:

- **Collections that cannot are skipped**, decided from the field config.
- **`depth: 0`**, so relationships come back as ids and nothing is populated.
- **`overrideAccess: true`**, because this answers a question about the
  database, not about what the caller may see. A draft the current user cannot
  read still breaks a page when its image is deleted.

`limit: 0` reads every row, and grows with the archive. That is why this runs
on a delete, on one admin panel and in two MCP tools, not on a listing: each is
rare, initiated by a person, and already waiting on a round trip.

## Drafts and published, both

A versioned collection's published row and its latest draft disagree in both
directions, and both are a reason not to delete. So both are read and merged by
document. Version history is not read: it grows without bound, and a superseded
draft is not a page anybody is looking at. So restoring an old version can
still surface a reference to something since deleted.

## The target's own collection

Read too, skipping only the document itself, so a taxonomy term's children
(which name it as `parent`) are found by the same scan rather than a second
query.

## Failure

A read that fails is not caught here. "Could not check" must never become
"found nothing", which is the difference between an unused file and a delete
nobody should have allowed, so each caller decides: the delete guard refuses,
the admin panel renders nothing.
*/

/** One document or global that references the target. */
export interface DocumentReferences {
  /** The collection's slug, or the global's slug when `global` is true. */
  collection: string
  id: number | string
  /** The document's title, name, slug or heading, or its id. */
  label: string
  /** Every place inside it that points at the target. */
  references: Reference[]
  /** True when any reference is inside a block, and so has no foreign key. */
  viaBlock: boolean
  /** True for a global, whose `id` is its slug. */
  global?: boolean
}

export interface FindReferencesOptions {
  /** Joins the caller's transaction. A `beforeDelete` hook runs inside one. */
  req?: PayloadRequest
  /**
   * Blocks to resolve by slug beyond the config's `blocks` registry. A
   * `blocks` field's own blocks are always used, so this is rarely needed.
   */
  blocks?: readonly Block[]
}

const LABEL_FIELDS = ['title', 'name', 'slug', 'heading']

function labelOf(doc: Record<string, unknown>): string {
  for (const key of LABEL_FIELDS) {
    const value = doc[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return `#${String(doc['id'])}`
}

/** The config's block registry plus any extras, by slug. */
export function blockRegistry(payload: Payload, extra: readonly Block[] = []): Map<string, Block> {
  const registry = new Map<string, Block>()
  const configured = (payload.config as { blocks?: readonly Block[] }).blocks ?? []
  for (const block of [...configured, ...extra]) registry.set(block.slug, block)
  return registry
}

interface Source {
  collection: string
  id: number | string
  label: string
  fields: readonly Field[]
  data: Record<string, unknown>
  global?: boolean
}

/** Every row and global that could reference `target`, published and draft. */
async function eachSource(
  payload: Payload,
  target: CollectionSlug,
  req: PayloadRequest | undefined,
  visit: (source: Source) => void,
): Promise<void> {
  for (const collection of payload.config.collections) {
    if (!couldReference(collection.fields, target)) continue

    const passes = collection.versions ? [false, true] : [false]
    for (const draft of passes) {
      const result = await payload.find({
        collection: collection.slug,
        depth: 0,
        // Join fields would add a subquery per row, and the walk reads only
        // stored fields. Typed per collection, hence the cast.
        joins: false as never,
        limit: 0,
        pagination: false,
        overrideAccess: true,
        ...(draft ? { draft: true } : {}),
        ...(req ? { req } : {}),
      })
      for (const doc of result.docs as unknown as Record<string, unknown>[]) {
        visit({
          collection: collection.slug,
          id: doc['id'] as number | string,
          label: labelOf(doc),
          fields: collection.fields,
          data: doc,
        })
      }
    }
  }

  for (const global of payload.config.globals) {
    if (!couldReference(global.fields, target)) continue
    const data = (await payload.findGlobal({
      slug: global.slug,
      depth: 0,
      overrideAccess: true,
      ...(req ? { req } : {}),
    })) as unknown as Record<string, unknown>
    const label = typeof global.label === 'string' ? global.label : global.slug
    visit({
      collection: global.slug,
      id: global.slug,
      label,
      fields: global.fields,
      data,
      global: true,
    })
  }
}

/**
 * Every document and global that references `collection`'s document `id`,
 * merged across the published and draft states.
 */
export async function findReferences(
  payload: Payload,
  target: { collection: CollectionSlug; id: number | string },
  options: FindReferencesOptions = {},
): Promise<DocumentReferences[]> {
  const blocks = blockRegistry(payload, options.blocks)
  const found = new Map<string, DocumentReferences>()

  await eachSource(payload, target.collection, options.req, (source) => {
    // The document itself is not a reference to itself.
    if (
      !source.global &&
      source.collection === target.collection &&
      String(source.id) === String(target.id)
    ) {
      return
    }
    const references = referencesIn(source.fields, source.data, {
      collection: target.collection,
      blocks,
    }).filter((reference) => String(reference.id) === String(target.id))
    if (references.length === 0) return

    const key = `${source.global ? 'global' : 'collection'}:${source.collection}:${String(source.id)}`
    const existing = found.get(key)
    if (existing) {
      // Seen as published and as draft: keep the union of paths.
      const seen = new Set(existing.references.map((r) => r.path))
      for (const reference of references) {
        if (!seen.has(reference.path)) existing.references.push(reference)
      }
      existing.viaBlock ||= references.some((r) => r.viaBlock)
      return
    }
    found.set(key, {
      collection: source.collection,
      id: source.id,
      label: source.label,
      references,
      viaBlock: references.some((r) => r.viaBlock),
      ...(source.global ? { global: true } : {}),
    })
  })

  return [...found.values()]
}

/**
 * Every id in `collection` that anything references, from one read of the
 * whole config. For a caller that needs the answer for a whole library at once
 * (an "unused media" report) rather than one scan per document. Ids are
 * strings, since a JSON block and a relationship column disagree on whether an
 * id is a number.
 */
export async function findReferencedIds(
  payload: Payload,
  collection: CollectionSlug,
  options: FindReferencesOptions = {},
): Promise<Set<string>> {
  const blocks = blockRegistry(payload, options.blocks)
  const used = new Set<string>()
  await eachSource(payload, collection, options.req, (source) => {
    for (const reference of referencesIn(source.fields, source.data, { collection, blocks })) {
      const id = String(reference.id)
      // A document naming itself does not make it used.
      if (!source.global && source.collection === collection && id === String(source.id)) continue
      used.add(id)
    }
  })
  return used
}

/** One line per document: `pages › Homepage (layout[2] › ImageHero › image)`. */
export function describeReferences(found: readonly DocumentReferences[], limit = 5): string {
  const lines = found.map((entry) => {
    const where = entry.references[0]?.path
    return `• ${entry.collection} › ${entry.label}${where ? ` (${where})` : ''}`
  })
  const named = lines.slice(0, limit).join('\n')
  return lines.length > limit ? `${named}\n…and ${lines.length - limit} more.` : named
}

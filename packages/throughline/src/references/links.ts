import type { Block, Field } from 'payload'
import { idOf, walkDocument, type NamedField, type WalkLocation, type WalkVisitor } from './walk.js'

/*
Which documents one document links to, found by the same structural walk as
`referencesIn` (forumone-2026#756).

## What counts as a link

Not every relationship. An author, a list of related articles or a form block's
form are relationships, and a draft one of those is somebody else's problem. A
link is a place a reader can follow to another page, and there are two:

- **A relationship field marked as a link target**, with
  `custom: { [LINK_TARGET_KEY]: true }`. Throughline's design-system generator
  marks the `reference` of every link it builds; a host marks its own
  hand-written link fields the same way, with `markLinkTarget`. That marker is
  how the platform finds a site's links without learning its schema.
- **A Lexical internal link**: a `link` or `autolink` node whose `linkType` is
  `internal`, pointing at `doc: { relationTo, value }`.

## A reference the reader cannot reach is not a link

A generated link is a group with a `mode`, and only `internal` follows the
reference: switch a link to "Another site" and the old reference stays stored
beside the URL. So a marked field whose siblings carry a `mode` other than
`internal` is skipped, which is the same rule the renderer uses (`mode` absent
means internal). A host whose link group decides differently passes a `when`
in the marker instead.

## Links in a composed section

A composed section (the publishing plugin's `recipes`) stores its content in a
`json` field, one value per field its recipe declares, so the config says
nothing about which values are links: the recipe does. Given the recipe's
fields (`composed.fieldsOf`), the content is walked as though the recipe's
fields were Payload fields — a `link` as a group holding a `mode` and a marked
`reference`, a `richtext` as rich text, a `group` or `array` by its `of` — so
the same two rules decide what a link is. Every link found there reports the
content field's own path, because nothing inside the JSON is a field the admin
can mark. `composedRecipeIds` says which recipes to read first.

This module imports nothing at run time, so a `'use client'` module can take
the marker from `@forumone/throughline/links`.
*/

/** The key a relationship field's `custom` carries to say it is a link. */
export const LINK_TARGET_KEY = 'throughlineLinkTarget'

/**
 * What the marker may hold. `true` follows the generator's rule: the reference
 * counts unless a sibling `mode` says the link goes somewhere else. `when`
 * replaces that rule for a link group shaped differently — it is handed the
 * group's data and answers whether the reference is the live branch.
 */
export type LinkTargetMarker = true | { when?: (siblings: Record<string, unknown>) => boolean }

/**
 * Marks a hand-written relationship field as a link target, so the publish
 * pipeline's `link-targets` step checks where it goes.
 *
 * ```ts
 * markLinkTarget({ name: 'page', type: 'relationship', relationTo: ['pages', 'posts'] })
 * ```
 */
export function markLinkTarget<T extends Field>(field: T, marker: LinkTargetMarker = true): T {
  const custom = (field as { custom?: Record<string, unknown> }).custom
  return { ...field, custom: { ...custom, [LINK_TARGET_KEY]: marker } }
}

/** The marker on a field, when it is a relationship or upload carrying one. */
export function linkTargetMarker(field: Field): LinkTargetMarker | undefined {
  if (field.type !== 'relationship' && field.type !== 'upload') return undefined
  const custom = (field as { custom?: Record<string, unknown> }).custom
  const marker = custom?.[LINK_TARGET_KEY]
  if (marker === true) return true
  if (marker && typeof marker === 'object') return marker as LinkTargetMarker
  return undefined
}

/** One link to another document, and where in this one it is. */
export interface LinkTarget {
  /** The linked document's collection. */
  relationTo: string
  /** The linked document's id, as it appears in the data. */
  id: number | string
  /** Whether it was found in a marked field or in rich text. */
  source: 'field' | 'richText'
  /** The walk's location: human path, data path, block and top-level field. */
  at: WalkLocation
}

/** A content field a recipe declares, as far as finding links needs it. */
export interface ComposedContentField {
  name: string
  /** The contract field type: `link`, `richtext`, `group` and `array` can hold links. */
  type: string
  /** A `group`'s or `array`'s own fields. */
  of?: readonly ComposedContentField[] | undefined
}

/** Where a composed section keeps its recipe and its content. */
export interface ComposedSectionShape {
  /** The block type a composed section is stored as, e.g. `ComposedSection`. */
  blockType: string
  /** The block's relationship to its recipe. Default: `recipe`. */
  recipeField?: string | undefined
  /** The block's `json` content, one value per recipe field. Default: `content`. */
  contentField?: string | undefined
}

export interface ComposedSectionLinks extends ComposedSectionShape {
  /**
   * The content fields of the recipe a block points at, by the id it holds;
   * `undefined` for a recipe that could not be read, whose content is skipped.
   */
  fieldsOf: (recipeId: number | string) => readonly ComposedContentField[] | undefined
}

export interface LinkTargetsInOptions {
  /** As `ReferencesInOptions.blocks`: the config's registry, for `blockReferences` and Lexical blocks. */
  blocks?: readonly Block[] | ReadonlyMap<string, Block>
  /** Composed sections, whose links are in their content as their recipe declares it. */
  composed?: ComposedSectionLinks | undefined
}

function isLive(marker: LinkTargetMarker, siblings: Record<string, unknown>): boolean {
  if (marker !== true && marker.when) return marker.when(siblings)
  const mode = siblings['mode']
  return mode === undefined || mode === null || mode === 'internal'
}

/** `{ relationTo, id }` pairs out of a relationship value. */
function targetsIn(
  field: NamedField,
  value: unknown,
): { relationTo: string; id: number | string }[] {
  const { relationTo } = field as { relationTo?: unknown }
  const entries: unknown[] = Array.isArray(value) ? value : [value]
  const out: { relationTo: string; id: number | string }[] = []
  for (const entry of entries) {
    if (Array.isArray(relationTo)) {
      // Polymorphic: `{ relationTo, value }`.
      if (!entry || typeof entry !== 'object') continue
      const { relationTo: to, value: held } = entry as { relationTo?: unknown; value?: unknown }
      const id = idOf(held)
      if (typeof to === 'string' && id !== undefined) out.push({ relationTo: to, id })
      continue
    }
    if (typeof relationTo !== 'string') continue
    const id = idOf(entry)
    if (id !== undefined) out.push({ relationTo, id })
  }
  return out
}

/** Whether a field is a composed section's content, and the recipe id beside it. */
function composedContent(
  shape: ComposedSectionShape | undefined,
  field: NamedField,
  siblings: Record<string, unknown>,
): { recipeId: number | string | undefined } | undefined {
  if (!shape || siblings['blockType'] !== shape.blockType) return undefined
  if (field.name !== (shape.contentField ?? 'content')) return undefined
  return { recipeId: idOf(siblings[shape.recipeField ?? 'recipe']) }
}

/**
 * A recipe's fields as the Payload fields that would store the same data, so
 * the content can be walked like any other. A `link` is the group `linkField`
 * builds: a `mode` beside a marked, polymorphic `reference`.
 */
function asPayloadFields(fields: readonly ComposedContentField[]): Field[] {
  const out: Field[] = []
  for (const field of fields) {
    switch (field.type) {
      case 'link':
        out.push({
          name: field.name,
          type: 'group',
          fields: [
            { name: 'mode', type: 'text' },
            markLinkTarget({ name: 'reference', type: 'relationship', relationTo: [] as never[] }),
          ],
        })
        break
      case 'richtext':
        out.push({ name: field.name, type: 'richText' })
        break
      case 'group':
        out.push({ name: field.name, type: 'group', fields: asPayloadFields(field.of ?? []) })
        break
      case 'array':
        out.push({ name: field.name, type: 'array', fields: asPayloadFields(field.of ?? []) })
        break
      default:
        break
    }
  }
  return out
}

/**
 * The recipes a document's composed sections point at, each once, so a caller
 * can read them in one query before `linkTargetsIn` asks for their fields.
 */
export function composedRecipeIds(
  fields: readonly Field[],
  data: Record<string, unknown> | undefined,
  options: { blocks?: LinkTargetsInOptions['blocks']; composed: ComposedSectionShape },
): (number | string)[] {
  const ids = new Map<string, number | string>()
  walkDocument(
    fields,
    data,
    {
      field(field, _value, siblings) {
        const found = composedContent(options.composed, field, siblings)
        if (!found) return false
        if (found.recipeId !== undefined) ids.set(String(found.recipeId), found.recipeId)
        return true
      },
    },
    options.blocks ? { blocks: options.blocks } : {},
  )
  return [...ids.values()]
}

/**
 * Every link inside one document. Pure, like `referencesIn`: the field config
 * and the data in, the links out, and no database.
 */
export function linkTargetsIn(
  fields: readonly Field[],
  data: Record<string, unknown> | undefined,
  options: LinkTargetsInOptions = {},
): LinkTarget[] {
  const out: LinkTarget[] = []
  const { composed } = options
  const walkOptions = options.blocks ? { blocks: options.blocks } : {}

  const visitor: WalkVisitor = {
    field(field, value, siblings, at) {
      const content = composedContent(composed, field, siblings)
      if (content && composed) {
        const recipeFields =
          content.recipeId === undefined ? undefined : composed.fieldsOf(content.recipeId)
        if (recipeFields && value && typeof value === 'object' && !Array.isArray(value)) {
          // Inside the JSON, every link is reported at the content field itself.
          const within = (inner: WalkLocation): WalkLocation => ({
            ...at,
            path: `${at.path} › ${inner.path}`,
            viaBlock: true,
            inRichText: inner.inRichText,
          })
          walkDocument(
            asPayloadFields(recipeFields),
            value as Record<string, unknown>,
            {
              field: (f, v, s, inner) => visitor.field?.(f, v, s, within(inner)),
              richTextNode: (node, inner) => visitor.richTextNode?.(node, within(inner)),
            },
            walkOptions,
          )
        }
        return true
      }

      const marker = linkTargetMarker(field)
      if (!marker) return false
      if (isLive(marker, siblings)) {
        for (const target of targetsIn(field, value)) out.push({ ...target, source: 'field', at })
      }
      return true
    },
    richTextNode(node, at) {
      if (node['type'] !== 'link' && node['type'] !== 'autolink') return
      const fields = node['fields'] as Record<string, unknown> | undefined
      if (fields?.['linkType'] !== 'internal') return
      const doc = fields['doc'] as { relationTo?: unknown; value?: unknown } | null | undefined
      const id = idOf(doc?.value)
      if (typeof doc?.relationTo === 'string' && id !== undefined) {
        out.push({ relationTo: doc.relationTo, id, source: 'richText', at })
      }
    },
  }

  walkDocument(fields, data, visitor, walkOptions)
  return out
}

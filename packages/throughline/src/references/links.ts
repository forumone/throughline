import type { Block, Field } from 'payload'
import { idOf, walkDocument, type NamedField, type WalkLocation } from './walk.js'

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

export interface LinkTargetsInOptions {
  /** As `ReferencesInOptions.blocks`: the config's registry, for `blockReferences` and Lexical blocks. */
  blocks?: readonly Block[] | ReadonlyMap<string, Block>
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
  walkDocument(
    fields,
    data,
    {
      field(field, value, siblings, at) {
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
    },
    options,
  )
  return out
}

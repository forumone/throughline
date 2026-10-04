import { componentDisplayName } from '@forumone/throughline-design-system/contract'

/*
A path into a document, said the way the edit view says it. forumone-2026#805.

Software reports a path — `layout[2].image`, `seo.title` — because it walks a
document, and a path is the right thing for software: the admin marks the field
with it, and an MCP caller can follow it. An editor reading `layout[2]` has to
count blocks from zero. So this follows the path through the field config and
says it with the config's own labels: `Block 3 (Image Hero) › Image`,
`SEO › Title`.

From the config rather than from anything the caller knows, so a block renamed
in a host's overrides is called what the editor sees. A path the config cannot
follow — past a relationship into the document it points at, or a field the
config has never heard of — is described as far as it can be, and not at all
when not even its first step is a field.

Used by the publish pipeline for every issue it reports, and by the reference
guards for the places a document is still used.
*/

export interface FieldLike {
  type?: string
  name?: string
  label?: unknown
  labels?: { singular?: unknown; plural?: unknown }
  fields?: readonly FieldLike[]
  tabs?: readonly TabLike[]
  blocks?: readonly BlockLike[]
  blockReferences?: ReadonlyArray<string | BlockLike>
}

interface TabLike {
  name?: string
  label?: unknown
  fields?: readonly FieldLike[]
}

export interface BlockLike {
  slug: string
  labels?: { singular?: unknown }
  fields?: readonly FieldLike[]
}

/** The parts of the config a description is read from. */
export interface FieldConfig {
  fields: readonly FieldLike[]
  /** Blocks declared once at the top of the config and referenced by slug. */
  blocks?: readonly BlockLike[] | ReadonlyMap<string, BlockLike>
  /** A blocks field whose own label goes without saying: the collection's layout. */
  layoutField?: string
}

/**
 * `layout[2].image` → `Block 3 (Image Hero) › Image`. `undefined` when the
 * path's first step is not a field the config has.
 */
export function describeFieldPath(
  path: string,
  config: FieldConfig,
  document: Record<string, unknown>,
): string | undefined {
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((s) => s !== '' && s !== '(root)')

  const parts: string[] = []
  let fields: readonly FieldLike[] | undefined = config.fields
  let data: unknown = document
  let i = 0

  while (fields && i < segments.length) {
    const found = findField(fields, segments[i]!)
    if (!found) break
    parts.push(...found.tabs)
    const field = found.field
    const isLayout = i === 0 && field.name === config.layoutField
    data = child(data, segments[i]!)
    i++
    fields = undefined

    const index = i < segments.length && /^\d+$/.test(segments[i]!) ? Number(segments[i]) : null

    if (field.type === 'blocks') {
      if (!isLayout) parts.push(labelOf(field))
      if (index === null) break
      const row = child(data, String(index)) as { blockType?: unknown } | undefined
      const type = typeof row?.blockType === 'string' ? row.blockType : undefined
      const block = type ? findBlock(field, type, config) : undefined
      const name = block ? labelText(block.labels?.singular) ?? componentDisplayName(type!) : undefined
      parts.push(name ? `Block ${index + 1} (${name})` : `Block ${index + 1}`)
      data = row
      fields = block?.fields
      i++
      continue
    }

    if (field.type === 'array') {
      if (index === null) {
        parts.push(labelOf(field))
        break
      }
      parts.push(`${labelText(field.labels?.singular) ?? labelOf(field)} ${index + 1}`)
      data = child(data, String(index))
      fields = field.fields
      i++
      continue
    }

    parts.push(labelOf(field))
    // A named group or tab: its fields are the next step. Anything else — a
    // relationship, an upload, rich text — is as far as the config goes.
    if (field.type === 'group' || field.type === 'tab') fields = field.fields
  }

  return parts.length > 0 ? parts.join(' › ') : undefined
}

/**
 * The field called `name` in `fields`, looking through the containers that
 * have no name of their own and so store their fields at this level — rows,
 * collapsibles, unnamed groups, unnamed tabs. An unnamed tab is named in the
 * result, because it is where an editor has to click to find the field.
 */
export function findField(
  fields: readonly FieldLike[],
  name: string,
): { field: FieldLike; tabs: string[] } | undefined {
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs ?? []) {
        if (tab.name) {
          if (tab.name === name) {
            return {
              field: { type: 'tab', name: tab.name, label: tab.label, fields: tab.fields ?? [] },
              tabs: [],
            }
          }
          continue
        }
        const inner = findField(tab.fields ?? [], name)
        if (inner) {
          const label = labelText(tab.label)
          return { field: inner.field, tabs: [...(label ? [label] : []), ...inner.tabs] }
        }
      }
      continue
    }
    if (field.name === name) return { field, tabs: [] }
    if (!field.name && Array.isArray(field.fields)) {
      const inner = findField(field.fields, name)
      if (inner) return inner
    }
  }
  return undefined
}

/** The config of the block `type` in a blocks field, inline or by reference. */
export function findBlock(
  field: FieldLike,
  type: string,
  config: Pick<FieldConfig, 'blocks'>,
): BlockLike | undefined {
  const inline = field.blocks?.find((b) => b.slug === type)
  if (inline) return inline
  for (const ref of field.blockReferences ?? []) {
    if (typeof ref === 'string') {
      if (ref === type) return registered(config.blocks, type)
    } else if (ref.slug === type) {
      return ref
    }
  }
  return undefined
}

function registered(
  blocks: FieldConfig['blocks'],
  slug: string,
): BlockLike | undefined {
  if (!blocks) return undefined
  if (blocks instanceof Map) return blocks.get(slug)
  return (blocks as readonly BlockLike[]).find((b) => b.slug === slug)
}

function child(data: unknown, key: string): unknown {
  return data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined
}

function labelOf(field: FieldLike): string {
  return labelText(field.label) ?? humanizeName(field.name ?? '')
}

/** A label as Payload allows it: a string, or one per language. A function says nothing here. */
export function labelText(label: unknown): string | undefined {
  if (typeof label === 'string' && label.trim() !== '') return label
  if (label && typeof label === 'object') {
    const byLanguage = label as Record<string, unknown>
    const en = byLanguage['en']
    if (typeof en === 'string' && en.trim() !== '') return en
    const first = Object.values(byLanguage).find((v) => typeof v === 'string' && v.trim() !== '')
    if (typeof first === 'string') return first
  }
  return undefined
}

/** `metaTitle` → `Meta title`, the way Payload labels a field it was given no label for. */
export function humanizeName(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

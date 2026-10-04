import type { Block, Field, PayloadRequest } from 'payload'

/*
`describe_content_type`'s answer, from the live config.

Everything an agent needs before it writes, and nothing it could get wrong by
reading a copy: types, limits, required, select options and relationship
targets come off the field configs, and a blocks field's allowed blocks come
from its own `filterOptions` — the function the admin's block picker calls — so
the list an agent is given is the list the admin would let an editor pick from.
*/

/** One field an author may set. */
export interface FieldDescription {
  name: string
  type: string
  label?: string
  description?: string
  required?: true
  hasMany?: true
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  minRows?: number
  maxRows?: number
  /** A select's or radio's values. */
  options?: string[]
  /** A relationship's or upload's target collection(s). */
  relationTo?: string | string[]
  /** How to find a value for it: the `find_related` kind that searches its target. */
  findWith?: string
  /** A group's or array row's fields. */
  fields?: FieldDescription[]
  /** A blocks field's blocks: what may be added. */
  blocks?: BlockDescription[]
}

export interface BlockDescription {
  slug: string
  label?: string
  /** The picker shelf it sits on. */
  group?: string
}

export interface DescribeContext {
  /** The config's block registry, for a blocks field that refers to blocks by slug. */
  blocks: ReadonlyMap<string, Block>
  /** For a `filterOptions` that reads the request. */
  req: PayloadRequest
  /** Collection slug → the `find_related` kind that searches it. */
  findWith: ReadonlyMap<string, string>
}

/** A field that stores nothing of its own and only arranges others. */
function isWrapper(field: Field): boolean {
  return !('name' in field) || typeof field.name !== 'string' || field.name === ''
}

/**
 * The named fields at the top of a document, looking through unnamed tabs,
 * collapsibles and rows: the names a document is stored under.
 */
export function topLevelFields(fields: readonly Field[]): Field[] {
  const out: Field[] = []
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab && typeof tab.name === 'string' && tab.name !== '') {
          out.push({ ...tab, type: 'group' } as unknown as Field)
        } else {
          out.push(...topLevelFields(tab.fields))
        }
      }
    } else if (isWrapper(field) && 'fields' in field && Array.isArray(field.fields)) {
      out.push(...topLevelFields(field.fields))
    } else {
      out.push(field)
    }
  }
  return out
}

/** The fields a collection lets an author set, in the order the admin shows them. */
export function writableFields(fields: readonly Field[], names: readonly string[]): Field[] {
  const wanted = new Set(names)
  return topLevelFields(fields).filter(
    (field) => 'name' in field && wanted.has(field.name as string),
  )
}

/** The names in `names` that are not top-level fields of `fields`. */
export function unknownFieldNames(fields: readonly Field[], names: readonly string[]): string[] {
  const known = new Set(
    topLevelFields(fields).map((field) => ('name' in field ? (field.name as string) : '')),
  )
  return names.filter((name) => !known.has(name))
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value
  if (value && typeof value === 'object' && typeof (value as { en?: unknown }).en === 'string') {
    return (value as { en: string }).en
  }
  return undefined
}

/** Whether an author can set this field at all: it stores something and is not hidden or read-only. */
function isAuthored(field: Field): boolean {
  if (field.type === 'ui' || field.type === 'join') return false
  if ('hidden' in field && field.hidden) return false
  const admin = (field as { admin?: { hidden?: unknown; readOnly?: unknown; disabled?: unknown } })
    .admin
  if (admin?.hidden || admin?.readOnly || admin?.disabled) return false
  if ('virtual' in field && field.virtual) return false
  return true
}

function optionValues(options: readonly unknown[]): string[] {
  return options.map((option) =>
    typeof option === 'string' ? option : String((option as { value: unknown }).value),
  )
}

async function blocksOf(
  field: Extract<Field, { type: 'blocks' }>,
  ctx: DescribeContext,
): Promise<BlockDescription[]> {
  const all: Block[] = [
    ...(field.blocks ?? []),
    ...(field.blockReferences ?? []).flatMap((ref) => {
      const block = typeof ref === 'string' ? ctx.blocks.get(ref) : ref
      return block ? [block] : []
    }),
  ]

  /*
  The picker's own question, asked for a document that holds nothing yet. A
  `filterOptions` that keeps whatever a document already holds (so an existing
  one stays saveable) adds nothing here, which is the point: this is what may be
  *added*.
  */
  let allowed: ReadonlySet<string> | undefined
  if (typeof field.filterOptions === 'function') {
    const answer = await field.filterOptions({
      data: {},
      siblingData: {},
      id: undefined as never,
      req: ctx.req,
      user: ctx.req.user,
    } as never)
    if (Array.isArray(answer)) allowed = new Set(answer as string[])
  } else if (Array.isArray(field.filterOptions)) {
    allowed = new Set(field.filterOptions as string[])
  }

  return all
    .filter((block) => !allowed || allowed.has(block.slug))
    .map((block) => {
      const label = text(block.labels?.singular)
      const group = text((block.admin as { group?: unknown } | undefined)?.group)
      return { slug: block.slug, ...(label ? { label } : {}), ...(group ? { group } : {}) }
    })
}

/** One field, and what is inside it. */
export async function describeField(
  field: Field,
  ctx: DescribeContext,
): Promise<FieldDescription | undefined> {
  if (!('name' in field) || !isAuthored(field)) return undefined
  const f = field as Field & Record<string, unknown>
  const admin = f['admin'] as { description?: unknown } | undefined

  const out: FieldDescription = { name: field.name as string, type: field.type }
  const label = text(f['label'])
  if (label) out.label = label
  const description = text(admin?.description)
  if (description) out.description = description
  if (f['required'] === true) out.required = true
  if (f['hasMany'] === true) out.hasMany = true
  for (const key of ['minLength', 'maxLength', 'min', 'max', 'minRows', 'maxRows'] as const) {
    if (typeof f[key] === 'number') out[key] = f[key] as number
  }

  if ((field.type === 'select' || field.type === 'radio') && Array.isArray(f['options'])) {
    out.options = optionValues(f['options'] as unknown[])
  }
  if (field.type === 'relationship' || field.type === 'upload') {
    const relationTo = f['relationTo'] as string | string[]
    out.relationTo = relationTo
    const kind = typeof relationTo === 'string' ? ctx.findWith.get(relationTo) : undefined
    if (kind) out.findWith = kind
  }
  if (field.type === 'group' || field.type === 'array') {
    const children = await describeFields(
      topLevelFields((f['fields'] as Field[] | undefined) ?? []),
      ctx,
    )
    out.fields = children
  }
  if (field.type === 'blocks') {
    out.blocks = await blocksOf(field as Extract<Field, { type: 'blocks' }>, ctx)
  }
  return out
}

export async function describeFields(
  fields: readonly Field[],
  ctx: DescribeContext,
): Promise<FieldDescription[]> {
  const out: FieldDescription[] = []
  for (const field of fields) {
    const described = await describeField(field, ctx)
    if (described) out.push(described)
  }
  return out
}

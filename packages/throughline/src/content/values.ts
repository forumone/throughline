import type { Block, Field } from 'payload'
import type { RichTextConverter, RichTextSource } from './options.js'

/*
Every value a write carries, at every depth, in the shape its field takes —
or refused, saying the shape. forumone-2026#832.

A draft save skips validation, and Payload coerces what it is handed rather
than refusing it. So a link sent as a string, `ctaHref: "/contact"`, was saved
as `{ mode: "internal" }` with nowhere to go, and a rich-text field inside a
block handed `{ markdown: "…" }` stored that object, which renders nothing. Both
came back as success. Three of four agents in the #830 eval lost a link this
way; one shipped an accordion with no text.

So before anything is saved: a group (a link is one) takes an object; an array
and a blocks field take a list of objects; and rich text inside a group, an
array row or a block is converted from Markdown or HTML by the site's
`blockRichText`, or refused. Top-level rich text keeps its own per-field
converter, in `write.ts`.
*/

export interface ValueProblem {
  path: string
  message: string
  details?: unknown
}

export interface ValueContext {
  /** The config's blocks, for a blocks field that refers to them by slug. */
  registry: ReadonlyMap<string, Block>
  /** Converts Markdown or HTML for a rich-text field below the top level. */
  blockRichText?: RichTextConverter | undefined
}

type Data = Record<string, unknown>
type BlocksField = Extract<Field, { type: 'blocks' }>

function isObject(value: unknown): value is Data {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isEditorState(value: unknown): boolean {
  const root = (value as { root?: unknown } | null)?.root
  return (
    Boolean(root) &&
    typeof root === 'object' &&
    Array.isArray((root as { children?: unknown }).children)
  )
}

/** `{ markdown }` or `{ html }`, and nothing beside it. */
export function richTextSource(value: unknown): RichTextSource | undefined {
  if (!isObject(value)) return undefined
  const keys = Object.keys(value)
  if (keys.length !== 1) return undefined
  if (typeof value['markdown'] === 'string') return { markdown: value['markdown'] }
  if (typeof value['html'] === 'string') return { html: value['html'] }
  return undefined
}

function named(field: Field): string | undefined {
  return 'name' in field && typeof field.name === 'string' ? field.name : undefined
}

function subfields(field: Field): Field[] {
  return ((field as { fields?: Field[] }).fields ?? []) as Field[]
}

/**
 * The shape a link group takes, from its own fields: Throughline's `linkField`
 * is a group of `mode`, `url` and `reference` (and `newTab`). `undefined` for
 * any other group.
 */
export function linkShape(field: Field): string | undefined {
  if (field.type !== 'group') return undefined
  const fields = new Map(subfields(field).flatMap((f) => (named(f) ? [[named(f)!, f]] : [])))
  if (!fields.has('mode') || !(fields.has('url') || fields.has('reference'))) return undefined
  const shapes: string[] = []
  if (fields.has('url')) shapes.push('{ mode: "external", url: "https://…" }')
  const reference = fields.get('reference') as { relationTo?: string | string[] } | undefined
  if (reference) {
    const to = reference.relationTo
    const targets = Array.isArray(to) ? to.join(' | ') : to
    shapes.push(
      `{ mode: "internal", reference: { relationTo: "${targets ?? '<collection>'}", value: <id> } }`,
    )
  }
  return shapes.join(', or ')
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

/**
 * Checks `data` against `fields`, converting nested rich text in place.
 * `path` is where `data` sits; `''` for a document, whose own rich-text fields
 * are left to `write.ts`.
 */
export async function checkValues(
  fields: readonly Field[],
  data: Data,
  ctx: ValueContext,
  path = '',
): Promise<ValueProblem[]> {
  const problems: ValueProblem[] = []
  const at = (name: string) => (path ? `${path}.${name}` : name)

  for (const field of fields) {
    if (field.type === 'row' || field.type === 'collapsible') {
      problems.push(...(await checkValues(subfields(field), data, ctx, path)))
      continue
    }
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        const name = 'name' in tab && typeof tab.name === 'string' ? tab.name : undefined
        if (!name) {
          problems.push(...(await checkValues(tab.fields, data, ctx, path)))
        } else if (isObject(data[name])) {
          problems.push(...(await checkValues(tab.fields, data[name] as Data, ctx, at(name))))
        }
      }
      continue
    }
    const name = named(field)
    if (!name || !(name in data)) continue
    const value = data[name]
    if (value === null || value === undefined) continue
    const here = at(name)

    switch (field.type) {
      case 'group': {
        if (!isObject(value)) {
          const link = linkShape(field)
          problems.push({
            path: here,
            message: link
              ? `${here} is a link and takes an object: ${link}.`
              : `${here} is a group and takes an object of its fields: ${subfields(field)
                  .flatMap((f) => named(f) ?? [])
                  .join(', ')}.`,
          })
          break
        }
        problems.push(...(await checkValues(subfields(field), value, ctx, here)))
        break
      }
      case 'array': {
        if (!Array.isArray(value)) {
          problems.push({ path: here, message: `${here} is a list and takes an array of rows.` })
          break
        }
        for (const [i, row] of value.entries()) {
          if (!isObject(row)) {
            problems.push({
              path: `${here}[${i}]`,
              message: `${here}[${i}] is a row and takes an object.`,
            })
            continue
          }
          problems.push(...(await checkValues(subfields(field), row, ctx, `${here}[${i}]`)))
        }
        break
      }
      case 'blocks': {
        if (!Array.isArray(value)) {
          problems.push({
            path: here,
            message: `${here} is a blocks field and takes an array of blocks.`,
          })
          break
        }
        for (const [i, row] of value.entries()) {
          if (!isObject(row) || typeof row['blockType'] !== 'string') {
            problems.push({
              path: `${here}[${i}]`,
              message: `${here}[${i}] is a block and takes { blockType, …fields }.`,
            })
            continue
          }
          const config = blockConfig(field, row['blockType'], ctx.registry)
          if (config)
            problems.push(...(await checkValues(config.fields, row, ctx, `${here}[${i}]`)))
        }
        break
      }
      case 'richText': {
        if (!path || isEditorState(value)) break
        const source = typeof value === 'string' ? undefined : richTextSource(value)
        if (source && ctx.blockRichText) {
          const converted = await ctx.blockRichText(source)
          if ('refused' in converted) {
            problems.push({
              path: here,
              message: `${here} could not be converted without losing something: ${converted.refused}`,
              ...(converted.details !== undefined ? { details: converted.details } : {}),
            })
          } else {
            data[name] = converted.state
          }
          break
        }
        problems.push({
          path: here,
          message: ctx.blockRichText
            ? `${here} is rich text and takes { markdown: "…" }, { html: "…" }, or an editor state ({ root: … }).`
            : `${here} is rich text and takes an editor state ({ root: … }), as get returns it.`,
        })
        break
      }
      default:
        break
    }
  }
  return problems
}

/** The refusal a write returns for value problems: nothing is saved. */
export function valueRefusal(problems: readonly ValueProblem[]) {
  return {
    error: `${problems.length === 1 ? 'A value is' : `${problems.length} values are`} not in the shape ${problems.length === 1 ? 'its field takes' : 'their fields take'}. Nothing was saved. ${problems.map((p) => p.message).join(' ')}`,
    problems,
  }
}

/**
 * How each kind of value is written, for an agent filling a block from its
 * contract, where a field's type is only a word: `link`, `richtext`, `image`.
 * Returned by `get` for a content type and by `design_guide` for a component,
 * so the shape is known before the first write rather than learnt from a
 * refusal. forumone-2026#832.
 */
export function valueShapes(options: { blockRichText: boolean }): Record<string, string> {
  return {
    link: '{ mode: "external", url: "https://…" } for another site, or { mode: "internal", reference: { relationTo: "<collection>", value: <id> } } for a page here (find gives the id). Never a plain string.',
    richtext: options.blockRichText
      ? '{ markdown: "…" } or { html: "…" }, converted; or an editor state ({ root: … }) as get returns it.'
      : 'an editor state ({ root: … }) as get returns it; not a string or Markdown.',
    image: 'the media document\'s id, from find with kind "media".',
    array: "a list of row objects, each with the row's own fields.",
  }
}

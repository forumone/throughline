import type { BlockLike, FieldLike } from '../../../utils/field-path.js'
import { findBlock } from '../../../utils/field-path.js'
import { plural } from '../../messages.js'
import type { PipelineIssue, PipelineStep } from '../types.js'
import { describeFieldPath, fieldConfigFor } from '../where.js'

/*
A page that still uses a placeholder image does not publish. forumone-2026#845.

An agent with no image for a slot can make an obvious placeholder (gray,
hatched, "PLACEHOLDER") so the draft can be previewed and reviewed. It is a
media document with a checkbox set, and that is all that distinguishes it, so
this asks the database which of the images a document uses are placeholders,
and names each place one is used: "Block 3 (Featured Work) › Item 2 › Image is
a placeholder. Replace it with the real image before publishing."

Off unless `placeholderImages` names the collection, so a site without
placeholders pays nothing.
*/

type Field = FieldLike & { relationTo?: unknown }

interface Use {
  path: string
  id: number | string
}

function idOf(value: unknown): number | string | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' || typeof id === 'string') return id
  }
  return undefined
}

/** Every use of an image from `collection` in `data`, by path. */
export function imageUses(
  fields: readonly FieldLike[] | undefined,
  data: unknown,
  collection: string,
  blocks: readonly BlockLike[] | ReadonlyMap<string, BlockLike> | undefined,
  prefix = '',
): Use[] {
  const out: Use[] = []
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const at = (name: string) => (prefix ? `${prefix}.${name}` : name)

  for (const raw of fields ?? []) {
    const field = raw as Field
    if (!field.name) {
      if (field.type === 'tabs') {
        for (const tab of field.tabs ?? []) {
          out.push(
            ...(tab.name
              ? imageUses(tab.fields, record[tab.name], collection, blocks, at(tab.name))
              : imageUses(tab.fields, record, collection, blocks, prefix)),
          )
        }
      } else {
        out.push(...imageUses(field.fields, record, collection, blocks, prefix))
      }
      continue
    }
    const value = record[field.name]
    const path = at(field.name)

    if (field.type === 'upload' && field.relationTo === collection) {
      const values = Array.isArray(value) ? value : [value]
      values.forEach((each, index) => {
        const id = idOf(each)
        if (id !== undefined)
          out.push({ path: Array.isArray(value) ? `${path}[${index}]` : path, id })
      })
    } else if (field.type === 'group' || field.type === 'tab') {
      out.push(...imageUses(field.fields, value, collection, blocks, path))
    } else if (field.type === 'array' && Array.isArray(value)) {
      value.forEach((row, index) => {
        out.push(...imageUses(field.fields, row, collection, blocks, `${path}[${index}]`))
      })
    } else if (field.type === 'blocks' && Array.isArray(value)) {
      value.forEach((row, index) => {
        const type = (row as { blockType?: unknown })?.blockType
        if (typeof type !== 'string') return
        const block = findBlock(field, type, { ...(blocks ? { blocks } : {}) })
        out.push(...imageUses(block?.fields, row, collection, blocks, `${path}[${index}]`))
      })
    }
  }
  return out
}

export const placeholderImagesStep: PipelineStep = async (ctx) => {
  const settings = ctx.options.placeholderImages
  if (!settings) return { pass: true }
  const field = settings.field ?? 'placeholder'
  const config = fieldConfigFor(ctx)
  if (!config) return { pass: true }

  const uses = imageUses(config.fields, ctx.document, settings.collection, config.blocks)
  if (uses.length === 0) return { pass: true }

  const ids = [...new Set(uses.map((use) => use.id))]
  const { docs } = await ctx.payload.find({
    collection: settings.collection as never,
    where: { and: [{ id: { in: ids } }, { [field]: { equals: true } }] } as never,
    limit: ids.length,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const placeholders = new Set((docs as { id: number | string }[]).map((doc) => String(doc.id)))
  const issues: PipelineIssue[] = uses
    .filter((use) => placeholders.has(String(use.id)))
    .map((use) => {
      const where = describeFieldPath(use.path, config, ctx.document) ?? use.path
      return {
        severity: 'error',
        rule: 'placeholder-image',
        message: `${where} is a placeholder. Replace it with the real image before publishing.`,
        field: use.path,
      }
    })
  if (issues.length === 0) return { pass: true }

  return {
    pass: false,
    code: 'placeholder-images',
    reason: `${plural(issues.length, 'placeholder image')} to replace before this can be published.`,
    issues,
    suggestion: 'Upload the real image, or ask for it, and put it where each placeholder is.',
  }
}

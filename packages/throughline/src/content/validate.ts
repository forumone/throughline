import type { Field, PayloadRequest } from 'payload'

/*
A block's own validation, run before it is saved.

A draft save skips Payload's field validation, in the admin and through the
Local API alike. An editor fills a block in front of them and the publish
pipeline catches what they left; an agent sends a block whole, so the block
tools check it whole, the way Payload would on a full save — each field's
`validate`, which sanitization gives every data field (the type's built-in,
carrying `required` and the length limits, or the generator's own), called with
the options Payload passes.
*/

export interface FieldProblem {
  /** Where, inside the block: `heading`, `items.1.label`. */
  path: string
  message: string
}

interface Walk {
  data: Record<string, unknown>
  req: PayloadRequest
  collection: string
  id: number | string | undefined
  blockData: Record<string, unknown>
}

function named(field: Field): field is Field & { name: string } {
  return 'name' in field && typeof field.name === 'string' && field.name !== ''
}

/** The fields stored under the same object as `field`'s siblings: an unnamed wrapper's, an unnamed tab's. */
function flatten(fields: readonly Field[]): Field[] {
  return fields.flatMap((field) => {
    if (field.type === 'tabs') {
      return field.tabs.flatMap((tab) =>
        'name' in tab && tab.name ? [{ ...tab, type: 'group' } as unknown as Field] : flatten(tab.fields),
      )
    }
    if (!named(field) && 'fields' in field && Array.isArray(field.fields)) return flatten(field.fields)
    return [field]
  })
}

async function walk(
  fields: readonly Field[],
  siblingData: Record<string, unknown>,
  path: string,
  ctx: Walk,
  problems: FieldProblem[],
): Promise<void> {
  for (const field of flatten(fields)) {
    if (!named(field) || field.type === 'ui') continue
    const value = siblingData[field.name]
    const here = path ? `${path}.${field.name}` : field.name
    const validate = (field as { validate?: unknown }).validate
    if (typeof validate === 'function') {
      const verdict = await validate(value, {
        ...field,
        blockData: ctx.blockData,
        collectionSlug: ctx.collection,
        data: ctx.data,
        event: 'submit',
        id: ctx.id,
        operation: ctx.id === undefined ? 'create' : 'update',
        overrideAccess: false,
        path: here.split('.'),
        preferences: { fields: {} },
        previousValue: undefined,
        req: ctx.req,
        siblingData,
      })
      if (verdict !== true && verdict !== undefined) {
        problems.push({ path: here, message: typeof verdict === 'string' ? verdict : 'Invalid.' })
      }
    }
    if (field.type === 'group' && value && typeof value === 'object') {
      await walk(fieldsOf(field), value as Record<string, unknown>, here, ctx, problems)
    }
    if (field.type === 'array' && Array.isArray(value)) {
      for (const [index, row] of value.entries()) {
        if (row && typeof row === 'object') {
          await walk(fieldsOf(field), row as Record<string, unknown>, `${here}.${index}`, ctx, problems)
        }
      }
    }
  }
}

function fieldsOf(field: Field): readonly Field[] {
  return 'fields' in field && Array.isArray(field.fields) ? field.fields : []
}

/**
 * Every problem Payload's own validation would report for one block, with a
 * path inside the block. Empty when it would save.
 */
export async function validateBlock(
  blockFields: readonly Field[],
  row: Record<string, unknown>,
  ctx: Omit<Walk, 'blockData'>,
): Promise<FieldProblem[]> {
  const problems: FieldProblem[] = []
  await walk(blockFields, row, '', { ...ctx, blockData: row }, problems)
  return problems
}

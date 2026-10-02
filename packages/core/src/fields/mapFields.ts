import type { Field } from 'payload'

/**
 * Apply `fn` to every field in the tree, including those nested in arrays,
 * groups, rows, collapsibles, tabs and inline blocks. From forumone-2026's
 * `fields/mapFields.ts`.
 *
 * Shared because several passes need it (the character counter, an icon
 * picker), and a second implementation would be a second chance to miss a
 * nesting case. A block given by slug (`blockReferences`) is left as it is: it
 * lives in the config's `blocks`, which a pass maps separately.
 */
export function mapFields(fields: Field[], fn: (field: Field) => Field): Field[] {
  return fields.map((field) => {
    const mapped = fn(field)

    if ('fields' in mapped && Array.isArray(mapped.fields)) {
      return { ...mapped, fields: mapFields(mapped.fields, fn) } as Field
    }

    if (mapped.type === 'tabs') {
      return {
        ...mapped,
        tabs: mapped.tabs.map((tab) => ({ ...tab, fields: mapFields(tab.fields, fn) })),
      }
    }

    if (mapped.type === 'blocks' && Array.isArray(mapped.blocks)) {
      return {
        ...mapped,
        blocks: mapped.blocks.map((block) =>
          typeof block === 'string' ? block : { ...block, fields: mapFields(block.fields, fn) },
        ),
      }
    }

    return mapped
  })
}

import type { FieldLike } from '../../../utils/field-path.js'

/*
The required fields inside a block that are empty. forumone-2026#840.

A draft write does not enforce `required`, which is the point of drafts, so an
empty required field inside a block reached nothing before the publish's own
write — and `check`, which runs every step but that write, said the page was
ready. An agent then reported a page as publishable that had a card with no
image (which also took down its preview) and a form block with no form.

Walked from the block's **Payload** config, not its contract, for three
reasons:

- a field the site adds to a block (a form block's `source.form`) is in the
  config and in no contract;
- a contract field the site leaves out of the CMS is not in the config, and
  must not be reported as missing;
- a hidden field is filled by something other than the author — the form
  block's HubSpot `fields` are spliced in at render — and is not theirs to fill.

A field is required when the config says so, or when the contract does: a
generated link enforces `required` with a validate rather than Payload's flag,
so the flag alone would miss every required link.

Inside an optional group or array row that is empty, only Payload's own
`required` counts, because Payload's publish write would refuse those anyway.
The contract-only requirement does not count there: a link the contract
requires inside an optional "related case study" group nobody filled is not
missing. A block nobody started at all is the empty-block rule's to report.
*/

export interface ContractFieldLike {
  name: string
  required?: boolean | undefined
  of?: readonly ContractFieldLike[] | undefined
}

type Field = FieldLike & {
  required?: boolean
  admin?: { hidden?: boolean }
}

const BOOKKEEPING = new Set([
  'id',
  'blockType',
  'blockName',
  'mode',
  'newTab',
  'relationTo',
  'type',
  'variant',
  'version',
  'format',
  'indent',
  'direction',
])

/** Whether a value carries anything a reader would see. Matches the empty-block rule. */
function filled(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'number') return true
  if (typeof value === 'boolean') return false
  if (Array.isArray(value)) return value.some(filled)
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, inner]) => !BOOKKEEPING.has(key) && filled(inner),
    )
  }
  return false
}

/** Paths, from `prefix`, of every required field in `fields` that `data` leaves empty. */
export function emptyRequiredFields(
  fields: readonly FieldLike[] | undefined,
  contract: readonly ContractFieldLike[] | undefined,
  data: unknown,
  prefix: string,
): string[] {
  const out: string[] = []
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const byName = new Map((contract ?? []).map((field) => [field.name, field]))

  for (const raw of fields ?? []) {
    const field = raw as Field
    if (field.admin?.hidden || field.type === 'ui' || field.type === 'checkbox') continue

    // Containers with no name keep their fields at this level.
    if (!field.name) {
      if (field.type === 'tabs') {
        for (const tab of field.tabs ?? []) {
          out.push(
            ...(tab.name
              ? emptyRequiredFields(
                  tab.fields,
                  undefined,
                  record[tab.name],
                  `${prefix}.${tab.name}`,
                )
              : emptyRequiredFields(tab.fields, contract, record, prefix)),
          )
        }
      } else {
        out.push(...emptyRequiredFields(field.fields, contract, record, prefix))
      }
      continue
    }

    const own = byName.get(field.name)
    const required = field.required === true || own?.required === true
    const value = record[field.name]
    const path = `${prefix}.${field.name}`

    if (field.type === 'group') {
      if (!filled(value) && required) {
        out.push(path)
        continue
      }
      // An empty optional group: only Payload's own `required` inside it.
      const inner = filled(value) ? own?.of : undefined
      out.push(...emptyRequiredFields(field.fields, inner, value, path))
      continue
    }

    if (field.type === 'array') {
      const rows = Array.isArray(value) ? value : []
      if (required && !rows.some(filled)) {
        out.push(path)
        continue
      }
      rows.forEach((row, index) => {
        const inner = filled(row) ? own?.of : undefined
        out.push(...emptyRequiredFields(field.fields, inner, row, `${path}[${index}]`))
      })
      continue
    }

    // A nested blocks field is its blocks' own business.
    if (field.type === 'blocks') continue

    if (required && !filled(value)) out.push(path)
  }
  return out
}

import type { Block, Field } from 'payload'

/*
Adding a block and saving must not fail validation before anybody types
anything.

The first site on this package found a block that could not be added at all:
`allOrNothing` — "fill this group or leave it, but do not half-fill it" — read
an unticked checkbox as evidence the group had been filled in, and demanded the
text beside it. The editor saw "Consent is invalid" on a block they had not
touched. The bug was in the generated rule, not in the component, so the
general form below catches every group with the same shape.

**Untouched, not empty.** Payload does not store nothing for a new block. A
checkbox stores its `defaultValue`, a radio stores its default option, an array
stores `[]` — and every one of those is a value a rule has to read as "nobody
has been here yet". Constructing the data the way Payload does is most of this
file; asserting is one line.

Only a field's own `validate` is called. Payload's built-in `required` check is
not on the field config, and a required field in an untouched block is meant to
fail it — that is the author being asked to fill it in, not a defect.
*/

/** How many rows an untouched array holds: none, or one an author added and left empty. */
export type UntouchedRows = 'none' | 'one'

type NamedField = Field & { name: string; defaultValue?: unknown; validate?: unknown }

function isNamed(field: Field): field is NamedField {
  return 'name' in field && typeof (field as { name?: unknown }).name === 'string'
}

/**
 * The fields a wrapper holds under the same data object as itself: a `row` or
 * `collapsible`'s children, and an unnamed tab's. A named tab is a key of its
 * own and is returned by `namedChildren` instead.
 */
function childrenOf(field: Field): Field[] {
  if (field.type === 'tabs') {
    return field.tabs.flatMap(tab => ('name' in tab && tab.name ? [] : tab.fields))
  }
  return 'fields' in field && Array.isArray(field.fields) ? field.fields : []
}

/** A `tabs` field's named tabs, which store their fields under the tab's name. */
function namedTabs(field: Field): Array<{ name: string; fields: Field[] }> {
  if (field.type !== 'tabs') return []
  return field.tabs.flatMap(tab =>
    'name' in tab && typeof tab.name === 'string' ? [{ name: tab.name, fields: tab.fields }] : [],
  )
}

/**
 * A block's fields, as Payload stores them for a freshly-added one.
 *
 * A value of `undefined` means the key is absent, which is what an untyped text
 * field is. Everything else is a default somebody declared: the contract's own,
 * or the `false` the generator gives a boolean whose contract says nothing.
 */
export function untouchedData(fields: Field[], rows: UntouchedRows): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  for (const field of fields) {
    if (!isNamed(field)) {
      // Presentational wrappers hold their children under the same data
      // object rather than a key of their own.
      Object.assign(data, untouchedData(childrenOf(field), rows))
      for (const tab of namedTabs(field)) data[tab.name] = untouchedData(tab.fields, rows)
      continue
    }

    let value: unknown

    if (field.type === 'group') {
      value = untouchedData(childrenOf(field), rows)
    } else if (field.type === 'array') {
      /*
      `[]` rather than nothing — Payload stores the empty list — and `one` is
      an author who clicks "Add row" and saves before filling it in: the same
      defect one level down, reachable in the admin with two clicks.
      */
      value = rows === 'one' ? [untouchedData(childrenOf(field), 'none')] : []
    } else if (field.type === 'blocks') {
      value = []
    } else {
      // Payload resolves a function default at save time.
      const { defaultValue } = field
      value = typeof defaultValue === 'function' ? (defaultValue as () => unknown)() : defaultValue
    }

    if (value !== undefined) data[field.name] = value
  }

  return data
}

/** One field's `validate`, with what Payload would hand it for an untouched block. */
export interface ValidateCase {
  /** `Block.group.field`, `Block.items[0].title` — so a failure is a finding, not a search. */
  path: string
  validate: (value: unknown, options: unknown) => unknown
  value: unknown
  siblingData: Record<string, unknown>
}

/** Every field carrying a `validate`, flattened, with the value it would be handed. */
export function validateCases(
  fields: Field[],
  data: Record<string, unknown>,
  path: string,
): ValidateCase[] {
  const found: ValidateCase[] = []

  for (const field of fields) {
    if (!isNamed(field)) {
      found.push(...validateCases(childrenOf(field), data, path))
      for (const tab of namedTabs(field)) {
        const value = data[tab.name]
        if (value && typeof value === 'object') {
          found.push(
            ...validateCases(tab.fields, value as Record<string, unknown>, `${path}.${tab.name}`),
          )
        }
      }
      continue
    }

    const value = data[field.name]
    const here = `${path}.${field.name}`

    if (typeof field.validate === 'function') {
      found.push({
        path: here,
        validate: field.validate as ValidateCase['validate'],
        value,
        siblingData: data,
      })
    }

    if (field.type === 'group' && value && typeof value === 'object') {
      found.push(...validateCases(childrenOf(field), value as Record<string, unknown>, here))
    }

    if (field.type === 'array' && Array.isArray(value)) {
      value.forEach((row, index) => {
        found.push(
          ...validateCases(childrenOf(field), row as Record<string, unknown>, `${here}[${index}]`),
        )
      })
    }
  }

  return found
}

/**
 * The second argument Payload passes a `validate`.
 *
 * `req.payload` throws on use rather than answering. A validate that looks
 * something up should return early for an empty value before it does; if one
 * stops doing that, it fails here, loudly, rather than reaching for a database
 * from a suite that has none.
 */
export function validateOptions(
  siblingData: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const payload = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then' || typeof property === 'symbol') return undefined
        return () =>
          Promise.reject(
            new Error(
              `A field validate called payload.${property} for an untouched block. ` +
                'An empty value should pass before anything is looked up.',
            ),
          )
      },
    },
  )
  return {
    siblingData,
    data,
    operation: 'create',
    req: { payload, user: null },
  }
}

/** A validate that refused an untouched block. */
export interface UntouchedFailure {
  path: string
  rows: UntouchedRows
  /** What the validate returned or threw. */
  result: string
}

/** The validate cases for every block, for both row counts. */
export function untouchedCases(
  blocks: readonly Block[],
  rows: UntouchedRows,
): Array<ValidateCase & { blockData: Record<string, unknown> }> {
  return blocks.flatMap(block => {
    const data = untouchedData(block.fields, rows)
    return validateCases(block.fields, data, block.slug).map(found => ({
      ...found,
      blockData: data,
    }))
  })
}

/** Run one case; `true` when it passes, the message when it does not. */
export async function runValidateCase(
  found: ValidateCase & { blockData: Record<string, unknown> },
): Promise<true | string> {
  try {
    const result = await found.validate(
      found.value,
      validateOptions(found.siblingData, found.blockData),
    )
    return result === true ? true : String(result)
  } catch (error) {
    return `threw: ${error instanceof Error ? error.message : String(error)}`
  }
}

/** Every validate that refuses an untouched block, with no rows and with one empty row. */
export async function checkUntouchedBlocks(blocks: readonly Block[]): Promise<UntouchedFailure[]> {
  const failures: UntouchedFailure[] = []
  for (const rows of ['none', 'one'] as const) {
    for (const found of untouchedCases(blocks, rows)) {
      const result = await runValidateCase(found)
      if (result !== true) failures.push({ path: found.path, rows, result })
    }
  }
  return failures
}

import type { Block, Field } from 'payload'
import type { ContentField } from '../generate/fields'

/*
A component's default has to survive the trip into the CMS.

A React default lives in the signature — `hasFacade = true` — and applies only
when the prop arrives as `undefined`. Nothing generated ever leaves it that way:
a checkbox is stored ticked or unticked and never absent, and `coerce` turns
whatever is stored into a real boolean. So the component is always handed an
explicit value and its own default is unreachable; the contract's
`defaultValue` is the only default that reaches a reader.

While the generator hardcoded `false` for every boolean, the first site's video
embed — whose contract says to leave its click-to-load facade on — shipped with
it off, putting a provider's iframe and its cookies in the server HTML of every
page with a video.

So this asserts the composition rather than any one link in it: the contract
declares the default, and the generated block config is what Payload stores for
a block nobody has touched. And the other direction: a generated text field has
no string default, because a string default is content nobody typed, written
into every block anybody adds.
*/

type NamedField = Field & { name: string; defaultValue?: unknown }

const isNamed = (field: Field): field is NamedField =>
  'name' in field && typeof (field as { name?: unknown }).name === 'string'

/**
 * A field list's named fields, looking through presentational wrappers — the
 * generator arranges fields into rows and collapsibles, which store nothing.
 */
function namedFields(fields: readonly Field[]): NamedField[] {
  return fields.flatMap(field => {
    if (isNamed(field)) return [field]
    if (field.type === 'tabs') return field.tabs.flatMap(tab => namedFields(tab.fields))
    return 'fields' in field && Array.isArray(field.fields) ? namedFields(field.fields) : []
  })
}

/** A generated default that disagrees with the contract. */
export interface DefaultMismatch {
  /** `Block.group.field` */
  path: string
  /** What the contract says the default is. */
  contract: unknown
  /** What the generated field will store. */
  generated: unknown
  message: string
}

/**
 * Every generated default in one block that disagrees with its contract.
 *
 * Walks the contract, not the block: a field an override omits or retypes is
 * the host's decision and is not reported, and fields the generator adds of its
 * own — a link's mode and new-tab box — are not the contract's to declare.
 */
export function defaultMismatches(
  block: Block,
  contractFields: readonly ContentField[],
): DefaultMismatch[] {
  return walk(contractFields, block.fields, block.slug)
}

function walk(
  contractFields: readonly ContentField[],
  generatedFields: readonly Field[],
  path: string,
): DefaultMismatch[] {
  const found: DefaultMismatch[] = []
  const generated = namedFields(generatedFields)

  for (const field of contractFields) {
    const match = generated.find(candidate => candidate.name === field.name)
    if (!match) continue
    const here = `${path}.${field.name}`

    if (field.type === 'boolean' && match.type === 'checkbox') {
      const expected = field.defaultValue ?? false
      if (match.defaultValue !== expected) {
        found.push({
          path: here,
          contract: field.defaultValue,
          generated: match.defaultValue,
          message:
            `${here} starts ${String(match.defaultValue)} in the CMS, and its contract says ` +
            `${field.defaultValue === undefined ? 'nothing, which means false' : String(field.defaultValue)}. ` +
            `A checkbox is never undefined, so the component's own default never applies.`,
        })
      }
    }

    // Text only. A select's default is a choice among the component's own
    // options, not copy, and the contract has no way to declare one yet.
    if (
      field.type === 'text' &&
      typeof match.defaultValue === 'string' &&
      match.defaultValue !== ''
    ) {
      found.push({
        path: here,
        contract: undefined,
        generated: match.defaultValue,
        message:
          `${here} has the string default "${match.defaultValue}": content nobody typed, ` +
          `written into every block anybody adds.`,
      })
    }

    if ((field.type === 'group' || field.type === 'array') && field.of && 'fields' in match) {
      found.push(...walk(field.of, (match as { fields: Field[] }).fields, here))
    }
  }

  return found
}

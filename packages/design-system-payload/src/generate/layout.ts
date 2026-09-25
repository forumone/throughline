import type { Field } from 'payload'
import type { ContentField } from './fields'
import { pairTitle } from './labels'

/*
How a block's fields are arranged on screen, as distinct from what they are.

Everything here is presentational. An unnamed `group` and a `collapsible` hold
their children in the same data object as their siblings, so moving a field
into one changes where it is drawn and nothing about where it is stored: no
migration, no change to `payload-types.ts`, and `coerce` — which walks the
contract, not this config — never sees the difference. That is the property
that makes it safe to rearrange every block at once.

Two rules, both read off the contract rather than configured per block.

**A label and its link are one thing.** A contract names a call to action as a
pair of siblings, `ctaLabel` and `ctaHref`, because the component takes them as
two props. Generated literally, the editor drew them as unrelated fields with
unrelated headings: a text box captioned "Cta Label" and, below it, a group
headed "Cta Href". So a `<prefix>Label` text field and a `<prefix>Href` or
`<prefix>Url` link become one group headed by what they are together — "Call to
action", "View all link" — at the position of whichever came first. A
`<prefix>Icon` beside them joins too, since it is drawn inside the same button.

**What most authors should leave alone goes behind a disclosure.** Top-level
selects, checkboxes and numbers on a block are how it looks — heading level,
variant, columns, aspect ratio — and every one has a default the component
already chose well. A field the contract marks `advanced` is the same kind of
thing in words: a screen-reader label or a status message the component
already supplies. Both move to one collapsed "More options" section at the end
of the block, so an author reading a block sees its content first. A field the
contract marks `required` is never tucked away, whatever its type: a required
field hidden behind a closed section is an error nobody can find.

Only the top level gets the disclosure. Inside an array, a collapsed section per
row would be one more click on every card, which is the cost this exists to
remove.
*/

/** The data-bearing field types that set how a block looks rather than what it says. */
const SETTING_TYPES = new Set<ContentField['type']>(['select', 'boolean', 'number'])

const LINK_SUFFIX = /^(.+)(Href|Url)$/

export interface ArrangeOptions {
  /** Gather settings and `advanced` fields into a collapsed section. Top level only. */
  disclose: boolean
}

interface Pair {
  prefix: string
  link: number
  label: number
  icon?: number
}

/** The label/link pairs among one level's fields, by contract index. */
function findPairs(contract: ContentField[], generated: (Field | null)[]): Pair[] {
  const index = new Map(contract.map((field, i) => [field.name, i]))
  const pairs: Pair[] = []

  contract.forEach((field, i) => {
    // An `advanced` link is one the component fills in itself —
    // `ShareDiscussion.copyUrl` is the current page unless told otherwise — so
    // it goes with the other defaults rather than beside the label it shares a
    // prefix with.
    if (field.type !== 'link' || field.advanced || !generated[i]) return
    const prefix = LINK_SUFFIX.exec(field.name)?.[1]
    if (!prefix) return

    const label = index.get(`${prefix}Label`)
    if (label === undefined || contract[label]?.type !== 'text' || !generated[label]) return

    const icon = index.get(`${prefix}Icon`)
    pairs.push({
      prefix,
      link: i,
      label,
      ...(icon !== undefined && generated[icon] ? { icon } : {}),
    })
  })

  return pairs
}

/**
 * A link group drawn inside its pair: the pair's heading already names it.
 *
 * Its description stays on it. Payload draws a group's description only in
 * the header a label opens, so with `label: false` nothing shows twice — and
 * `payload-types.ts`, which carries each description as JSDoc on the field it
 * belongs to, keeps the contract's guidance on the property it describes.
 */
function unheaded(link: Field): Field {
  return { ...link, label: false } as Field
}

function pairGroup(pair: Pair, contract: ContentField[], generated: (Field | null)[]): Field {
  const link = generated[pair.link] as Field
  const label = generated[pair.label] as Field
  const icon = pair.icon === undefined ? null : generated[pair.icon]

  // The link's description is about the destination, which is what the pair's
  // heading introduces, so it moves up to sit under that heading.
  const description = contract[pair.link]?.constraints

  return {
    type: 'group',
    label: pairTitle(pair.prefix),
    ...(description ? { admin: { description } } : {}),
    fields: [
      { ...label, label: 'Label' } as Field,
      ...(icon ? [{ ...icon, label: 'Icon' } as Field] : []),
      unheaded(link),
    ],
  } as Field
}

function isSetting(field: ContentField): boolean {
  return !field.required && (SETTING_TYPES.has(field.type) || field.advanced === true)
}

/**
 * One level's generated fields, in the order and grouping an author reads them.
 *
 * `generated[i]` is the Payload field for `contract[i]`, or null where the
 * contract field is not authorable. Nulls are dropped here, so the caller does
 * not have to.
 */
export function arrange(
  contract: ContentField[],
  generated: (Field | null)[],
  options: ArrangeOptions,
): Field[] {
  const pairs = findPairs(contract, generated)
  const pairAt = new Map<number, Pair>()
  const consumed = new Set<number>()
  for (const pair of pairs) {
    const members = [pair.link, pair.label, ...(pair.icon === undefined ? [] : [pair.icon])]
    pairAt.set(Math.min(...members), pair)
    members.forEach(member => consumed.add(member))
  }

  const main: Field[] = []
  const more: Field[] = []

  contract.forEach((field, i) => {
    const pair = pairAt.get(i)
    if (pair) {
      main.push(pairGroup(pair, contract, generated))
      return
    }
    const built = generated[i]
    if (!built || consumed.has(i)) return
    ;(options.disclose && isSetting(field) ? more : main).push(built)
  })

  if (more.length === 0) return main

  return [
    ...main,
    {
      type: 'collapsible',
      label: 'More options',
      admin: {
        initCollapsed: true,
        description: 'Layout and wording the component already sets sensibly. Change them only when this block needs to differ.',
      },
      fields: more,
    } as Field,
  ]
}

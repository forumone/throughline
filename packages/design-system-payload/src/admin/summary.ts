/*
What a collapsed array row says about itself.

Payload's own row header is the array's name and a counter — "Stat 01",
"Stat 02", "Stat 03" — which is true of every row and tells an author nothing
about any of them. With six stats collapsed, finding the one that says "96%"
means opening them in turn, and reordering them means doing it blind. So a
generated array names its rows by what they hold: the first one or two short
text fields of the row, joined, as the author typed them.

Pure, and apart from the component that draws it, so the rule can be tested
without React or a form.
*/

/** How much of a row's text its header shows before it gives up. */
export const SUMMARY_MAX = 80

const SEPARATOR = ' · '

/**
 * The header for one row: its summary fields' text, or Payload's own
 * "Stat 03" while the row is still empty.
 *
 * `rowIndex` is zero-based, as Payload's row-label context hands it over.
 */
export function rowSummary(
  data: unknown,
  fields: readonly string[],
  singular: string,
  rowIndex: number | undefined,
): string {
  const row = (data ?? {}) as Record<string, unknown>
  const parts = fields
    .map(name => row[name])
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  if (parts.length === 0) {
    const number = rowIndex === undefined ? '' : ` ${String(rowIndex + 1).padStart(2, '0')}`
    return `${singular}${number}`
  }

  const text = parts.join(SEPARATOR)
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : text
}

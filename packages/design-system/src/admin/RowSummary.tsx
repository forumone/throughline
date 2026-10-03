'use client'

import { useRowLabel } from '@payloadcms/ui'
import { rowSummary } from './summary.js'

export interface RowSummaryProps {
  /** The row's fields to show, in order. Injected by the generator via `clientProps`. */
  fields: string[]
  /** Payload's singular label for the array, for a row with nothing typed yet. */
  singular: string
}

/**
 * The header of a generated array row — see `./summary.ts`.
 *
 * Reads the row from the form rather than from saved data, so the header
 * follows what the author is typing. The class and the `pointer-events` are
 * Payload's own fallback label's, so a click on the text still toggles the row.
 */
export function RowSummary({ fields, singular }: RowSummaryProps) {
  const { data, rowNumber } = useRowLabel<Record<string, unknown>>()
  return (
    <span className="row-label" style={{ pointerEvents: 'none' }}>
      {rowSummary(data, fields, singular, rowNumber)}
    </span>
  )
}

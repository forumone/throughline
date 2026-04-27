export interface FormSubmissionRow {
  field: string
  value: string
}

/**
 * Reads the `submissionData` JSON field stored by the submit endpoint.
 * Tolerates both the array shape Form Builder uses and a plain
 * `{key: value}` object some integrations might write.
 */
export function readSubmissionRows(value: unknown): FormSubmissionRow[] {
  if (Array.isArray(value)) {
    const rows: FormSubmissionRow[] = []
    for (const entry of value) {
      if (entry && typeof entry === 'object' && 'field' in entry && 'value' in entry) {
        const e = entry as { field: unknown; value: unknown }
        rows.push({
          field: String(e.field ?? ''),
          value: typeof e.value === 'string' ? e.value : String(e.value ?? ''),
        })
      }
    }
    return rows
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([field, v]) => ({
      field,
      value: typeof v === 'string' ? v : String(v ?? ''),
    }))
  }
  return []
}

export function findFieldValue(rows: FormSubmissionRow[], fieldName: string): string | null {
  const row = rows.find((r) => r.field === fieldName)
  return row ? row.value : null
}

export function formatHumanDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

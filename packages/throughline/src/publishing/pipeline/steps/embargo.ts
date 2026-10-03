import type { PipelineStep } from '../types.js'

/**
 * Enforces the document's policy:
 * - `embargoedUntil`: blocks publish until that time has passed
 * - `expiresAt`: blocks publish if the document has already expired
 *
 * Both fields live under the configured `policyField` on the document.
 * Missing or null values are treated as "no policy applies" — the step
 * passes.
 */
export const embargoStep: PipelineStep = async (ctx) => {
  const policy = ctx.document[ctx.collection.policyField] as
    | Record<string, unknown>
    | undefined
  if (!policy) return { pass: true }

  const now = Date.now()
  const embargoedUntil = parseDate(policy['embargoedUntil'])
  if (embargoedUntil !== null && embargoedUntil > now) {
    return {
      pass: false,
      code: 'embargoed',
      reason: `Embargoed until ${new Date(embargoedUntil).toISOString()}`,
      suggestion:
        'Wait until the embargo expires, update the embargoedUntil date, or schedule publish for after the embargo.',
    }
  }

  const expiresAt = parseDate(policy['expiresAt'])
  if (expiresAt !== null && expiresAt < now) {
    return {
      pass: false,
      code: 'expired',
      reason: `Content expired on ${new Date(expiresAt).toISOString()}`,
      suggestion: 'Update the expiresAt date or unpublish this content.',
    }
  }

  return { pass: true }
}

function parseDate(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

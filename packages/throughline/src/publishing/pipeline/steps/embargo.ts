import { messageDate } from '../../messages.js'
import type { PipelineStep } from '../types.js'

/**
 * Enforces the document's policy:
 * - `embargoedUntil`: blocks publish until that time has passed
 * - `expiresAt`: blocks publish if the document has already expired
 *
 * Both fields live under the configured `policyField` on the document.
 * Missing or null values are treated as "no policy applies" — the step
 * passes.
 *
 * The time is written into `reason` in the site's configured zone
 * (`timeZone`, UTC by default) and named, and returned as `when` too, so the
 * admin can say it in the editor's own zone instead.
 */
export const embargoStep: PipelineStep = async (ctx) => {
  const policy = ctx.document[ctx.collection.policyField] as
    | Record<string, unknown>
    | undefined
  if (!policy) return { pass: true }

  const now = Date.now()
  const embargoedUntil = parseDate(policy['embargoedUntil'])
  if (embargoedUntil !== null && embargoedUntil > now) {
    const when = messageDate(embargoedUntil, ctx.options.timeZone)
    return {
      pass: false,
      code: 'embargoed',
      reason: `This can't go live until ${when.text}.`,
      suggestion:
        'Wait until then, change the embargo date, or schedule it to publish after that time.',
      when,
    }
  }

  const expiresAt = parseDate(policy['expiresAt'])
  if (expiresAt !== null && expiresAt < now) {
    const when = messageDate(expiresAt, ctx.options.timeZone)
    return {
      pass: false,
      code: 'expired',
      reason: `This content expired on ${when.text}.`,
      suggestion: 'Change the expiry date, or unpublish it.',
      when,
    }
  }

  return { pass: true }
}

function parseDate(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

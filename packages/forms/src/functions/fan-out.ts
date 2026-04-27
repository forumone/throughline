import type { Inngest, InngestFunction } from 'inngest'
import type { Payload } from 'payload'
import type { ResolvedFormsConfig } from '../options.js'

export interface FanOutDeps {
  inngest: Inngest
  payload: Payload
  resolved: ResolvedFormsConfig
  /** Override the function id. Default: `form-fan-out`. */
  id?: string
}

/**
 * Subscribes to `form/submission.received` (fired by the public submit
 * endpoint). Loads the form, walks `policy.destinations`, and dispatches
 * an `form/destination.<type>` event for each enabled, allowlisted entry.
 * If the form opts into a submitter confirmation, fires
 * `form/submitter-confirmation` as well.
 *
 * Each dispatch is its own `step.run` so a transient failure delivering
 * to one destination doesn't block the others. We deliberately do not
 * load the submission row here; the per-destination workers load it
 * themselves to keep this function dependency-light.
 */
export function createFormFanOutFunction(deps: FanOutDeps): InngestFunction.Any {
  return deps.inngest.createFunction(
    {
      id: deps.id ?? 'form-fan-out',
      retries: 3,
      triggers: [{ event: 'form/submission.received' }],
    },
    async ({ event, step, logger }) => {
      const data = (event.data ?? {}) as { formId?: string; submissionId?: string }
      const formId = data.formId
      const submissionId = data.submissionId
      if (!formId || !submissionId) {
        logger.warn('form/submission.received missing formId or submissionId; skipping')
        return { skipped: true }
      }

      const form = (await step.run('load-form', async () =>
        deps.payload.findByID({ collection: deps.resolved.formsCollectionSlug, id: formId }),
      )) as Record<string, unknown> | null
      if (!form) return { skipped: true, reason: 'form-not-found' }

      const policy = (form['policy'] ?? {}) as Record<string, unknown>
      const destinations = Array.isArray(policy['destinations'])
        ? (policy['destinations'] as Array<{ label?: string; enabled?: boolean }>)
        : []
      const submitterConfig = (policy['submitterConfirmation'] ?? {}) as { enabled?: boolean }

      let dispatched = 0
      let dropped = 0
      for (const dest of destinations) {
        if (dest.enabled === false || !dest.label) continue
        const allowed = deps.resolved.options.allowedDestinations.find(
          (d) => d.label === dest.label,
        )
        if (!allowed) {
          // Allowlist drift: a stored row references a label that's been
          // removed from the plugin config since the form was authored.
          // Drop and warn rather than fail the whole fan-out.
          logger.warn('Destination dropped — no longer in the allowlist', { label: dest.label })
          dropped += 1
          continue
        }

        await step.run(`dispatch-${dest.label}`, async () => {
          await deps.inngest.send({
            name: `form/destination.${allowed.type}`,
            data: {
              submissionId,
              formId,
              destinationLabel: dest.label,
            },
          })
        })
        dispatched += 1
      }

      if (submitterConfig.enabled === true) {
        await step.run('dispatch-submitter-confirmation', async () => {
          await deps.inngest.send({
            name: 'form/submitter-confirmation',
            data: { submissionId, formId },
          })
        })
      }

      return { dispatched, dropped, submitterConfirmation: submitterConfig.enabled === true }
    },
  )
}

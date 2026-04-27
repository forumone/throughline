import type { Inngest, InngestFunction } from 'inngest'
import type { Payload } from 'payload'
import type { EmailClient } from '@forumone/throughline-email'
import { FormSubmissionEmail } from '../templates/index.js'
import type { ResolvedFormsConfig } from '../options.js'
import { formatHumanDate, readSubmissionRows } from './_shared.js'

export interface EmailDestinationDeps {
  inngest: Inngest
  payload: Payload
  resolved: ResolvedFormsConfig
  /** Returns the shared email client. Lazy so the email plugin can attach later. */
  getEmailClient: () => EmailClient | undefined
  /** Brand name for the layout. Defaults to `'Forms'`. */
  brandName?: string
  /** Override the function id. Default: `form-email-destination`. */
  id?: string
}

/**
 * Subscribes to `form/destination.email` (dispatched by the fan-out).
 * Loads the submission and delivers a FormSubmissionEmail to the
 * allowlisted address keyed by the destination label. Re-validates the
 * label against the current allowlist as a defense-in-depth check —
 * the fan-out already validated, but a redeploy could have happened in
 * between.
 */
export function createEmailDestinationFunction(
  deps: EmailDestinationDeps,
): InngestFunction.Any {
  return deps.inngest.createFunction(
    {
      id: deps.id ?? 'form-email-destination',
      retries: 5,
      triggers: [{ event: 'form/destination.email' }],
    },
    async ({ event, step, logger }) => {
      const data = (event.data ?? {}) as {
        submissionId?: string
        destinationLabel?: string
      }
      if (!data.submissionId || !data.destinationLabel) return { skipped: true }

      const dest = deps.resolved.options.allowedDestinations.find(
        (d) => d.label === data.destinationLabel && d.type === 'email',
      )
      if (!dest) {
        logger.warn('Email destination no longer on allowlist', { label: data.destinationLabel })
        return { skipped: true, reason: 'destination-removed' }
      }

      const client = deps.getEmailClient()
      if (!client) {
        throw new Error(
          'Email client not available. Register `emailPlugin` before submissions are delivered.',
        )
      }

      const submission = await step.run('load-submission', async () =>
        deps.payload.findByID({
          collection: deps.resolved.submissionsCollectionSlug,
          id: data.submissionId!,
          depth: 1,
        }),
      ) as Record<string, unknown> | null
      if (!submission) return { skipped: true, reason: 'submission-not-found' }

      const formId = unwrapId(submission['form'])
      const form = formId
        ? ((await step.run('load-form', async () =>
            deps.payload.findByID({
              collection: deps.resolved.formsCollectionSlug,
              id: formId,
            }),
          )) as Record<string, unknown> | null)
        : null
      const formTitle = typeof form?.['title'] === 'string' ? (form['title'] as string) : '(untitled form)'

      const fields = readSubmissionRows(submission['submissionData'])
      const receivedAtIso =
        typeof submission['createdAt'] === 'string' ? (submission['createdAt'] as string) : ''
      const receivedAt = receivedAtIso ? formatHumanDate(receivedAtIso) : 'just now'

      await step.run(`send-${dest.label}`, async () => {
        await client.send({
          to: dest.value,
          subject: `New submission for ${formTitle}`,
          template: FormSubmissionEmail({
            formTitle,
            brandName: deps.brandName ?? 'Forms',
            receivedAt,
            fields,
          }),
          tags: [
            { name: 'type', value: 'form-submission' },
            { name: 'form-id', value: String(formId ?? '') },
            { name: 'destination', value: dest.label },
          ],
        })
      })

      return { ok: true, destinationLabel: dest.label }
    },
  )
}

function unwrapId(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id)
  }
  return null
}

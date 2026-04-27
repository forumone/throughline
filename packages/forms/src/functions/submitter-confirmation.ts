import type { Inngest, InngestFunction } from 'inngest'
import type { Payload } from 'payload'
import type { EmailClient } from '@forumone/throughline-email'
import { SubmitterConfirmationEmail } from '../templates/index.js'
import type { ResolvedFormsConfig } from '../options.js'
import { findFieldValue, readSubmissionRows } from './_shared.js'

export interface SubmitterConfirmationDeps {
  inngest: Inngest
  payload: Payload
  resolved: ResolvedFormsConfig
  getEmailClient: () => EmailClient | undefined
  brandName?: string
  /** Override the function id. Default: `form-submitter-confirmation`. */
  id?: string
}

/**
 * Subscribes to `form/submitter-confirmation` (dispatched by the fan-out
 * when the form has confirmation enabled). Reads the submission, finds
 * the email-typed field referenced by `submitterConfirmation.emailFieldName`,
 * and sends a SubmitterConfirmationEmail to that address.
 *
 * Skips silently and logs if anything is missing — a misconfigured
 * confirmation should never block the rest of the fan-out, and the
 * configuration error is admin-fixable.
 */
export function createSubmitterConfirmationFunction(
  deps: SubmitterConfirmationDeps,
): InngestFunction.Any {
  return deps.inngest.createFunction(
    {
      id: deps.id ?? 'form-submitter-confirmation',
      retries: 3,
      triggers: [{ event: 'form/submitter-confirmation' }],
    },
    async ({ event, step, logger }) => {
      const data = (event.data ?? {}) as { submissionId?: string; formId?: string }
      const submissionId = data.submissionId
      const formId = data.formId
      if (!submissionId || !formId) return { skipped: true }

      const form = (await step.run('load-form', async () =>
        deps.payload.findByID({ collection: deps.resolved.formsCollectionSlug, id: formId }),
      )) as Record<string, unknown> | null
      if (!form) return { skipped: true, reason: 'form-not-found' }

      const policy = (form['policy'] ?? {}) as Record<string, unknown>
      const confirmation = (policy['submitterConfirmation'] ?? {}) as {
        enabled?: boolean
        emailFieldName?: string
        subject?: string
        body?: string
      }
      if (confirmation.enabled !== true) return { skipped: true, reason: 'confirmation-disabled' }
      if (!confirmation.emailFieldName) {
        logger.warn('submitterConfirmation enabled but no emailFieldName set', { formId })
        return { skipped: true, reason: 'no-email-field' }
      }

      const submission = (await step.run('load-submission', async () =>
        deps.payload.findByID({
          collection: deps.resolved.submissionsCollectionSlug,
          id: submissionId,
        }),
      )) as Record<string, unknown> | null
      if (!submission) return { skipped: true, reason: 'submission-not-found' }

      const rows = readSubmissionRows(submission['submissionData'])
      const recipient = findFieldValue(rows, confirmation.emailFieldName)
      if (!recipient || !recipient.includes('@')) {
        logger.warn('Submitter email missing or invalid; skipping confirmation', {
          formId,
          field: confirmation.emailFieldName,
        })
        return { skipped: true, reason: 'recipient-invalid' }
      }

      const client = deps.getEmailClient()
      if (!client) {
        throw new Error(
          'Email client not available. Register `emailPlugin` before confirmations can send.',
        )
      }

      const subject = confirmation.subject?.trim() || 'Thank you for your submission'
      const bodyText = confirmation.body?.trim() || 'We received your submission and will be in touch.'
      const recipientName =
        findFieldValue(rows, 'name') ?? findFieldValue(rows, 'first_name') ?? 'there'

      await step.run(`send-${recipient}`, async () => {
        await client.send({
          to: recipient,
          subject,
          template: SubmitterConfirmationEmail({
            recipientName,
            brandName: deps.brandName ?? 'Forms',
            subject,
            body: bodyText,
          }),
          tags: [
            { name: 'type', value: 'form-submitter-confirmation' },
            { name: 'form-id', value: formId },
          ],
        })
      })

      return { ok: true, recipient }
    },
  )
}

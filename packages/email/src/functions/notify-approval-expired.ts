import type { Inngest, InngestFunction } from 'inngest'
import type { Payload } from 'payload'
import type { EmailClient } from '../client.js'
import type { EmailBrandTokens } from '../tokens.js'
import { ApprovalExpiredEmail } from '../templates/index.js'
import { DEFAULT_APPROVALS_COLLECTION_SLUG, type EmailPluginOptions } from '../options.js'
import { formatHumanDate, unwrapRelationshipId } from './_shared.js'

export interface NotifyApprovalExpiredDeps {
  inngest: Inngest
  payload: Payload
  client: EmailClient
  tokens: EmailBrandTokens
  options: EmailPluginOptions
  /** Override the function id. Default: `notify-approval-expired`. */
  id?: string
}

/**
 * Subscribes to `approval/expired` (fired by the C10 expire-stale-approvals
 * cron). Notifies the original requester so they can decide whether to
 * re-request approval or drop the change.
 */
export function createNotifyApprovalExpiredFunction(
  deps: NotifyApprovalExpiredDeps,
): InngestFunction.Any {
  return deps.inngest.createFunction(
    {
      id: deps.id ?? 'notify-approval-expired',
      retries: 3,
      triggers: [{ event: 'approval/expired' }],
    },
    async ({ event, step, logger }) => {
      const data = (event.data ?? {}) as { approvalId?: string; requesterId?: string | null }
      const approvalId = data.approvalId
      if (!approvalId) return { skipped: true, reason: 'no-approvalId' }

      const collectionSlug = deps.options.approvalsCollectionSlug ?? DEFAULT_APPROVALS_COLLECTION_SLUG

      const approval = await step.run('load-approval', async () =>
        deps.payload.findByID({ collection: collectionSlug, id: approvalId, depth: 1 }) as Promise<
          Record<string, unknown>
        >,
      )
      if (!approval) return { skipped: true, reason: 'approval-not-found' }

      const requesterId =
        data.requesterId ?? unwrapRelationshipId(approval['requestedBy'])
      if (!requesterId) {
        logger.warn('Expired approval has no requester; cannot notify', { approvalId })
        return { skipped: true, reason: 'no-requester' }
      }

      const targetTitle = String(approval['targetTitle'] ?? '(untitled)')
      const requestedAtIso = String(approval['requestedAt'] ?? '')
      const requestedAt = requestedAtIso ? formatHumanDate(requestedAtIso) : 'an earlier date'

      await step.run(`send-to-${requesterId}`, async () => {
        const requester = await deps.options.resolveRequester(requesterId)
        if (!requester) {
          logger.warn('No email for requester; skipping', { requesterId, approvalId })
          return
        }

        await deps.client.send({
          to: requester.email,
          subject: `Approval expired: ${targetTitle}`,
          template: ApprovalExpiredEmail({
            requesterName: requester.name ?? requester.email,
            targetTitle,
            requestedAt,
            tokens: deps.tokens,
          }),
          tags: [
            { name: 'type', value: 'approval-expired' },
            { name: 'approval-id', value: approvalId },
          ],
        })
      })

      return { approvalId, sent: 1 }
    },
  )
}

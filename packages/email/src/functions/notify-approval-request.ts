import type { Inngest, InngestFunction } from 'inngest'
import type { Payload } from 'payload'
import type { EmailClient } from '../client.js'
import type { EmailBrandTokens } from '../tokens.js'
import { ApprovalRequestEmail } from '../templates/index.js'
import { DEFAULT_APPROVALS_COLLECTION_SLUG, type EmailPluginOptions } from '../options.js'
import {
  formatHumanDate,
  readApproverIds,
  targetKindFromCollection,
  unwrapRelationshipId,
} from './_shared.js'

export interface NotifyApprovalRequestDeps {
  inngest: Inngest
  payload: Payload
  client: EmailClient
  tokens: EmailBrandTokens
  options: EmailPluginOptions
  /** Override the function id. Default: `notify-approval-request`. */
  id?: string
}

/**
 * Subscribes to `notification/send-approval-request` (fired by the C10
 * audit-event-echo when `approval.requested` is recorded). Loads the
 * approval, looks up the requester and each approver-id stored in
 * `notifiedApprovers`, and sends one email per approver. Each email is
 * its own `step.run` so a bouncing recipient retries without re-sending
 * to the others.
 */
export function createNotifyApprovalRequestFunction(
  deps: NotifyApprovalRequestDeps,
): InngestFunction.Any {
  return deps.inngest.createFunction(
    {
      id: deps.id ?? 'notify-approval-request',
      retries: 3,
      triggers: [{ event: 'notification/send-approval-request' }],
    },
    async ({ event, step, logger }) => {
      const data = (event.data ?? {}) as { approvalId?: string }
      const approvalId = data.approvalId
      if (!approvalId) {
        logger.warn('Skipping notify-approval-request without approvalId')
        return { skipped: true }
      }

      const collectionSlug = deps.options.approvalsCollectionSlug ?? DEFAULT_APPROVALS_COLLECTION_SLUG

      const approval = await step.run('load-approval', async () =>
        deps.payload.findByID({ collection: collectionSlug, id: approvalId, depth: 1 }) as Promise<
          Record<string, unknown>
        >,
      )

      if (!approval) {
        logger.warn('Approval not found for notify-approval-request', { approvalId })
        return { skipped: true, reason: 'approval-not-found' }
      }

      const approverIds = readApproverIds(approval['notifiedApprovers'])
      if (approverIds.length === 0) {
        logger.warn('No approvers to notify on approval', { approvalId })
        return { sent: 0, reason: 'no-approvers' }
      }

      const requesterId = unwrapRelationshipId(approval['requestedBy'])
      const requester = requesterId
        ? await step.run('load-requester', () => deps.options.resolveRequester(requesterId))
        : null
      const requesterName = requester?.name ?? requester?.email ?? 'A teammate'

      const targetCollection = String(approval['targetCollection'] ?? '')
      const targetId = String(approval['targetId'] ?? '')
      const targetTitle = String(approval['targetTitle'] ?? '(untitled)')
      const targetKind = targetKindFromCollection(targetCollection)
      const changesSummary = String(approval['changesSummary'] ?? '')
      const expiresAt = formatHumanDate(String(approval['expiresAt'] ?? ''))
      const requestReason =
        typeof approval['requestReason'] === 'string' ? (approval['requestReason'] as string) : undefined

      let previewUrl = typeof approval['previewUrl'] === 'string' ? (approval['previewUrl'] as string) : ''
      if (!previewUrl && deps.options.buildPreviewUrl) {
        previewUrl = await step.run('build-preview-url', async () =>
          deps.options.buildPreviewUrl!({ targetCollection, targetId, approvalId }),
        )
      }

      let sent = 0
      for (const approverId of approverIds) {
        await step.run(`send-to-${approverId}`, async () => {
          const approver = await deps.options.resolveApprover(approverId)
          if (!approver) {
            logger.warn('No email for approver; skipping', { approverId })
            return
          }

          const [approveUrl, changesUrl, discussUrl] = await Promise.all([
            deps.options.buildActionUrl({ approvalId, action: 'approve', approverId }),
            deps.options.buildActionUrl({ approvalId, action: 'changes', approverId }),
            deps.options.buildActionUrl({ approvalId, action: 'discuss', approverId }),
          ])

          await deps.client.send({
            to: approver.email,
            subject: `Approval needed: ${targetTitle}`,
            template: ApprovalRequestEmail({
              approverName: approver.name ?? approver.email,
              requesterName,
              targetTitle,
              targetKind,
              changesSummary,
              ...(requestReason ? { requestReason } : {}),
              previewUrl,
              approveUrl,
              changesUrl,
              discussUrl,
              expiresAt,
              tokens: deps.tokens,
            }),
            tags: [
              { name: 'type', value: 'approval-request' },
              { name: 'approval-id', value: approvalId },
            ],
          })
          sent += 1
        })
      }

      logger.info('Approval-request notifications sent', { approvalId, sent })
      return { approvalId, sent }
    },
  )
}

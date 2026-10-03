import type { Inngest } from 'inngest'
import {
  defineJob,
  type Job,
  type JobContext,
  type WorkflowFailureHandler,
} from '../../jobs/index.js'
import type { Payload } from 'payload'
import type { EmailClient } from '../client.js'
import type { EmailBrandTokens } from '../tokens.js'
import {
  ApprovalDecisionEmail,
  type ApprovalDecisionKind,
} from '../templates/index.js'
import { DEFAULT_APPROVALS_SLUG } from '../../approvals/collection.js'
import type { EmailPluginOptions } from '../options.js'
import { unwrapRelationshipId } from './_shared.js'

export interface NotifyApprovalDecisionDeps {
  inngest: Inngest
  payload: Payload
  client: EmailClient
  tokens: EmailBrandTokens
  options: EmailPluginOptions
  /** Override the function id. Default: `notify-approval-decision`. */
  id?: string
  /** Called once when a run has exhausted its retries. `emailPlugin` passes one. */
  onFailure?: WorkflowFailureHandler
}

const DECISION_BY_ACTION: Record<string, ApprovalDecisionKind> = {
  'approval.granted': 'granted',
  'approval.declined': 'declined',
  'approval.changes_requested': 'changes-requested',
}

const SUBJECT_BY_DECISION: Record<ApprovalDecisionKind, (title: string) => string> = {
  granted: (title) => `Approved: ${title}`,
  declined: (title) => `Not approved: ${title}`,
  'changes-requested': (title) => `Changes requested on ${title}`,
}

/**
 * Subscribes to `notification/send-approval-decision` (fired by the C10
 * audit-event-echo when one of `approval.granted`, `approval.declined`,
 * or `approval.changes_requested` is recorded). The decider's audit
 * action travels with the event so we render the right variant without
 * re-checking the approval's status.
 */
/** What the job needs at run time: the deps, less the Inngest client and id. */
export type NotifyApprovalDecisionJobDeps = Omit<NotifyApprovalDecisionDeps, 'inngest' | 'id'>

/**
 * The same notification as a runner-neutral job. `resolve` supplies its
 * dependencies when it runs: the plugin passes the ones it was built with, and `emailJobs` reads them from `context.payload`, for a runner
 * whose jobs are declared before Payload exists.
 */
export function notifyApprovalDecisionJob(
  resolve: (context: JobContext) => NotifyApprovalDecisionJobDeps,
  id = 'notify-approval-decision',
): Job {
  return defineJob(
    { id, retries: 3, on: { event: 'notification/send-approval-decision' } },
    async (context) => {
      const { event, step, logger } = context
      const deps = resolve(context)
      const data = (event.data ?? {}) as { approvalId?: string; decision?: string }
      const approvalId = data.approvalId
      const decisionAction = data.decision ?? ''
      if (!approvalId) return { skipped: true, reason: 'no-approvalId' }

      const decision = DECISION_BY_ACTION[decisionAction]
      if (!decision) {
        logger.warn('Unknown decision action; skipping', { approvalId, decisionAction })
        return { skipped: true, reason: 'unknown-decision' }
      }

      const collectionSlug = deps.options.approvalsCollectionSlug ?? DEFAULT_APPROVALS_SLUG

      const approval = await step.run('load-approval', async () =>
        deps.payload.findByID({ collection: collectionSlug, id: approvalId, depth: 1 }) as Promise<
          Record<string, unknown>
        >,
      )
      if (!approval) return { skipped: true, reason: 'approval-not-found' }

      const requesterId = unwrapRelationshipId(approval['requestedBy'])
      if (!requesterId) {
        logger.warn('Approval has no requester; cannot notify', { approvalId })
        return { skipped: true, reason: 'no-requester' }
      }

      const targetTitle = String(approval['targetTitle'] ?? '(untitled)')
      const decisionNotes =
        typeof approval['decisionNotes'] === 'string' ? (approval['decisionNotes'] as string) : undefined
      const previewUrl = typeof approval['previewUrl'] === 'string' ? (approval['previewUrl'] as string) : ''

      const decidedById = unwrapRelationshipId(approval['decidedBy'])
      const decidedByRecord = decidedById ? await deps.options.resolveApprover(decidedById) : null
      const decidedByName = decidedByRecord?.name ?? decidedByRecord?.email ?? 'a reviewer'

      await step.run(`send-to-${requesterId}`, async () => {
        const requester = await deps.options.resolveRequester(requesterId)
        if (!requester) {
          logger.warn('No email for requester; skipping', { requesterId, approvalId })
          return
        }

        await deps.client.send({
          to: requester.email,
          subject: SUBJECT_BY_DECISION[decision](targetTitle),
          template: ApprovalDecisionEmail({
            requesterName: requester.name ?? requester.email,
            decidedBy: decidedByName,
            targetTitle,
            decision,
            ...(decisionNotes ? { decisionNotes } : {}),
            previewUrl,
            tokens: deps.tokens,
          }),
          tags: [
            { name: 'type', value: 'approval-decision' },
            { name: 'approval-id', value: approvalId },
            { name: 'decision', value: decision },
          ],
        })
      })

      return { approvalId, decision, sent: 1 }
    },
  )
}

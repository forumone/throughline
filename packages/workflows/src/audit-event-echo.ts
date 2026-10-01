import { failureOptions } from './types.js'
import type { InngestFunction } from 'inngest'
import { defineJob } from './jobs/define.js'
import { inngestJobs } from './jobs/inngest.js'
import type { Job } from './jobs/types.js'
import type { AuditEventEchoOptions } from './types.js'

interface AuditRecordedData {
  action: string
  approvalRequestId?: string
  integrationId?: string
  actorId?: string
  targetCollection?: string
  targetId?: string
}

const APPROVAL_DECISION_ACTIONS = new Set([
  'approval.granted',
  'approval.declined',
  'approval.changes_requested',
])

/**
 * Subscribes to `audit/event.recorded` and fans out to notification
 * workflows. The built-in handlers cover the approval lifecycle (which
 * the email package in C11 subscribes to); custom handlers in
 * `options.handlers` add other fan-outs (e.g. "post integration.failed
 * to a #alerts Slack channel").
 *
 * Each handler runs in its own `step.run` so a failure in one fan-out
 * does not affect the others.
 */
export function auditEventEchoJob(options: Omit<AuditEventEchoOptions, 'inngest'>): Job {
  return defineJob(
    {
      id: options.id ?? 'audit-event-echo',
      /*
      No default cap. One audit row is one event, and the echo only fans it out
      to notification events — so runs are independent by construction and
      serialising them would put a queue in front of every audited write.
      */
      ...failureOptions(options),
      on: { event: 'audit/event.recorded' },
    },
    async ({ event, step, logger, emit }) => {
      const data = (event.data ?? {}) as AuditRecordedData
      logger.info('Audit event echoed', { action: data.action })

      await step.run('handle-approval-requested', async () => {
        if (data.action === 'approval.requested' && data.approvalRequestId) {
          await emit({
            name: 'notification/send-approval-request',
            data: { approvalId: data.approvalRequestId },
          })
        }
      })

      await step.run('handle-approval-decided', async () => {
        if (APPROVAL_DECISION_ACTIONS.has(data.action) && data.approvalRequestId) {
          await emit({
            name: 'notification/send-approval-decision',
            data: { approvalId: data.approvalRequestId, decision: data.action },
          })
        }
      })

      const handlers = options.handlers ?? []
      for (let index = 0; index < handlers.length; index += 1) {
        const handler = handlers[index]!
        await step.run(`custom-handler-${index}`, async () => {
          if (handler.match({ action: data.action })) {
            await handler.handle({
              action: data.action,
              data: data as unknown as Record<string, unknown>,
            })
          }
        })
      }
    },
  )
}

/** The same job, registered with Inngest exactly as it always was. */
export function createAuditEventEchoFunction(options: AuditEventEchoOptions): InngestFunction.Any {
  return inngestJobs(options.inngest).toFunction(auditEventEchoJob(options))
}

import type { InngestFunction } from 'inngest'
import { getAuditWriter } from '@forumone/throughline-core'
import type { ExpireStaleApprovalsOptions } from './types.js'

const DEFAULT_SCHEDULE = '0 2 * * *' // daily at 2am UTC
const DEFAULT_SLUG = 'approvals'

interface ExpiredApproval {
  id: string
  targetCollection: string
  targetId: string
  targetTitle: string
  requesterId: string | null
}

/**
 * Cron that finds pending approvals whose `expiresAt` has passed and flips
 * them to `status: 'expired'`. For each expired record it writes an
 * `approval.expired` audit event and fires an `approval/expired` Inngest
 * event so notification workflows (e.g. C11 email) can let the requester
 * know without polling.
 */
export function createExpireStaleApprovalsFunction(
  options: ExpireStaleApprovalsOptions,
): InngestFunction.Any {
  const schedule = options.schedule ?? DEFAULT_SCHEDULE
  const collectionSlug = options.collectionSlug ?? DEFAULT_SLUG

  return options.inngest.createFunction(
    {
      id: options.id ?? 'expire-stale-approvals',
      triggers: [{ cron: schedule }],
    },
    async ({ step, logger }) => {
      const now = new Date().toISOString()

      const expired = await step.run('find-expired', async (): Promise<ExpiredApproval[]> => {
        const result = await options.payload.find({
          collection: collectionSlug,
          where: {
            and: [
              { status: { equals: 'pending' } },
              { expiresAt: { less_than: now } },
            ],
          },
          limit: 500,
        })
        return (result.docs as Array<Record<string, unknown>>).map((doc) => ({
          id: String(doc['id']),
          targetCollection: String(doc['targetCollection'] ?? ''),
          targetId: String(doc['targetId'] ?? ''),
          targetTitle: String(doc['targetTitle'] ?? doc['targetId'] ?? '(unknown)'),
          requesterId: extractRequesterId(doc['requestedBy']),
        }))
      })

      if (expired.length === 0) {
        logger.info('No stale approvals to expire')
        return { expiredCount: 0 }
      }

      const auditWriter = getAuditWriter(options.payload)

      for (const approval of expired) {
        await step.run(`expire-${approval.id}`, async () => {
          await options.payload.update({
            collection: collectionSlug,
            id: approval.id,
            data: { status: 'expired' },
          })

          await auditWriter({
            actor: { type: 'system', apiKeyName: 'workflow:expire-stale-approvals' },
            action: 'approval.expired',
            mcpServer: 'approvals',
            mcpTool: 'expire-stale-approvals',
            targetCollection: approval.targetCollection,
            targetId: approval.targetId,
            targetTitle: approval.targetTitle,
            approvalRequestId: approval.id,
          })

          await options.inngest.send({
            name: 'approval/expired',
            data: {
              approvalId: approval.id,
              requesterId: approval.requesterId,
              targetCollection: approval.targetCollection,
              targetId: approval.targetId,
            },
          })
        })
      }

      logger.info('Expired stale approvals', { count: expired.length })
      return { expiredCount: expired.length }
    },
  )
}

function extractRequesterId(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id)
  }
  return null
}

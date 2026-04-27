import type { Payload } from 'payload'
import type { ActiveApproval, ApprovalResolver } from '@forumone/throughline-publishing'
import { DEFAULT_APPROVALS_SLUG } from './collection.js'

/**
 * Symbol under which the resolver is attached to the Payload instance.
 * Publishing's `approvalStep` looks here when its `options.approvalResolver`
 * is not set; this is the wiring point that lets clients add the approvals
 * plugin without re-configuring publishing.
 */
export const APPROVALS_RESOLVER_SYMBOL = Symbol.for(
  '@forumone/throughline/approvals-resolver',
)

export interface CreateApprovalResolverOptions {
  payload: Payload
  /** Override the approvals collection slug. Default: 'approvals'. */
  collectionSlug?: string
}

/**
 * Builds the resolver that the publishing server consumes. Looks up the
 * latest granted approval whose `targetVersion` matches the document
 * version under consideration. Multiple decisions are sorted by `decidedAt`
 * descending; first-decision-wins semantics mean the latest grant for a
 * given version is what counts.
 */
export function createApprovalResolver(
  options: CreateApprovalResolverOptions,
): ApprovalResolver {
  const { payload, collectionSlug = DEFAULT_APPROVALS_SLUG } = options

  return {
    async getActiveApproval(collection, id, version): Promise<ActiveApproval | null> {
      const result = await payload.find({
        collection: collectionSlug,
        where: {
          and: [
            { targetCollection: { equals: collection } },
            { targetId: { equals: id } },
            { targetVersion: { equals: version } },
            { status: { equals: 'granted' } },
          ],
        },
        limit: 1,
        sort: '-decidedAt',
      })

      const approval = result.docs[0] as Record<string, unknown> | undefined
      if (!approval) return null

      const decidedAt = approval['decidedAt']
      if (typeof decidedAt !== 'string') return null

      const decidedByRaw = approval['decidedBy']
      const decidedBy =
        typeof decidedByRaw === 'string'
          ? decidedByRaw
          : decidedByRaw && typeof decidedByRaw === 'object' && 'id' in decidedByRaw
            ? String((decidedByRaw as { id: unknown }).id)
            : ''

      return {
        id: String(approval['id']),
        grantedAt: decidedAt,
        grantedBy: decidedBy,
        version: String(approval['targetVersion']),
      }
    },
  }
}

/** Attaches the resolver to a Payload instance under the agreed symbol. */
export function attachApprovalResolver(
  payload: object,
  resolver: ApprovalResolver,
): void {
  Object.defineProperty(payload, APPROVALS_RESOLVER_SYMBOL, {
    value: resolver,
    enumerable: false,
    writable: false,
    configurable: false,
  })
}

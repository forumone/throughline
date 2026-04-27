import type { ApprovalResolver } from '../../options.js'
import type { PipelineStep } from '../types.js'

/**
 * Symbol the approvals plugin attaches its resolver under. Publishing's
 * approval step looks here when no resolver is supplied via options, which
 * lets clients add the approvals plugin without re-wiring publishing's
 * config. Keep in sync with the matching constant in the approvals package.
 */
export const APPROVALS_RESOLVER_SYMBOL = Symbol.for(
  '@forumone/throughline/approvals-resolver',
)

/**
 * Gates publish on a granted approval when the document's policy demands
 * one. Fails closed: if `policy.requiresApproval` is true but no resolver
 * is available (neither in options nor attached via the approvals plugin),
 * the step blocks the publish.
 *
 * Resolution order:
 *   1. `options.approvalResolver` (explicit wiring)
 *   2. The resolver attached on the Payload instance via
 *      `APPROVALS_RESOLVER_SYMBOL` by the approvals plugin
 */
export const approvalStep: PipelineStep = async (ctx) => {
  const policy = ctx.document[ctx.collection.policyField] as
    | Record<string, unknown>
    | undefined
  if (!policy?.['requiresApproval']) return { pass: true }

  const resolver = ctx.options.approvalResolver ?? lookupResolverOnPayload(ctx.payload)
  if (!resolver) {
    return {
      pass: false,
      code: 'approval-resolver-missing',
      reason: 'Document requires approval but no approval resolver is configured',
      suggestion:
        'Register approvalsPlugin in your Payload config (it attaches the resolver automatically) or pass an explicit `approvalResolver` to publishingPlugin.',
    }
  }

  const versionId = String(ctx.document['updatedAt'] ?? ctx.documentId)
  const approval = await resolver.getActiveApproval(
    ctx.collection.slug,
    ctx.documentId,
    versionId,
  )

  if (!approval) {
    return {
      pass: false,
      code: 'approval-required',
      reason:
        'This document requires approval and no granted approval exists for the current version',
      suggestion:
        'Use the Approvals Server to request approval. Once granted, publish will succeed.',
    }
  }

  return { pass: true }
}

function lookupResolverOnPayload(payload: object): ApprovalResolver | undefined {
  const value = (payload as Record<symbol, unknown>)[APPROVALS_RESOLVER_SYMBOL]
  return typeof value === 'object' && value !== null ? (value as ApprovalResolver) : undefined
}

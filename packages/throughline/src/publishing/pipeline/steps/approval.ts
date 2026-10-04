import { documentContentHash } from '../../../utils/content-hash.js'
import type { ApprovalResolver } from '../../options.js'
import type { PipelineStep } from '../types.js'
import { APPROVALS_RESOLVER_SYMBOL } from '../../../approvals/symbol.js'


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

  /*
  The approval binds to the document's content, not to its `updatedAt`. The
  approvals plugin's `request_approval` computes this same hash, with this
  same function, over a document loaded by the same `findByID` call — so an
  approval granted on what an approver read still resolves after a save that
  changed nothing, and does not resolve after one that changed something.

  Binding to `updatedAt` made that a property of a timestamp rather than a
  rule: any save at all invalidated a pending approval, which is also why
  autosave and approvals could not both be on. See #341.
  */
  const versionId = await documentContentHash(ctx.document)
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
        'Call publish with action "request_approval" to ask for one. Once it is granted, publishing will succeed.',
    }
  }

  return { pass: true }
}

function lookupResolverOnPayload(payload: object): ApprovalResolver | undefined {
  const value = (payload as Record<symbol, unknown>)[APPROVALS_RESOLVER_SYMBOL]
  return typeof value === 'object' && value !== null ? (value as ApprovalResolver) : undefined
}

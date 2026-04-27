import type { PipelineStep } from '../types.js'

/**
 * Gates publish on a granted approval when the document's policy demands
 * one. Fails closed: if `policy.requiresApproval` is true but no
 * `approvalResolver` is configured, the step fails rather than silently
 * letting the publish proceed without approval. The Approvals Server
 * (C7) provides the resolver implementation; until it ships, clients
 * who want approvals must wire their own.
 */
export const approvalStep: PipelineStep = async (ctx) => {
  const policy = ctx.document[ctx.collection.policyField] as
    | Record<string, unknown>
    | undefined
  if (!policy?.['requiresApproval']) return { pass: true }

  if (!ctx.options.approvalResolver) {
    return {
      pass: false,
      code: 'approval-resolver-missing',
      reason: 'Document requires approval but no approval resolver is configured',
      suggestion:
        'Add the approvalsPlugin to your Payload config and pass its resolver to publishingPlugin.approvalResolver.',
    }
  }

  const versionId = String(ctx.document['updatedAt'] ?? ctx.documentId)
  const approval = await ctx.options.approvalResolver.getActiveApproval(
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

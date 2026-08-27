import { z } from 'zod'
import type { Payload } from 'payload'
import {
  type AuditWriter,
  auditContext,
  documentContentHash,
  withMeta,
} from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { DEFAULT_APPROVALS_SLUG } from '../collection.js'
import type { ApprovalsPluginOptions } from '../options.js'

export interface RequestApprovalDeps {
  payload: Payload
  options: ApprovalsPluginOptions & { tokenSecret: string }
  auditWriter: AuditWriter
}

export function createRequestApprovalTool(deps: RequestApprovalDeps): McpToolDefinition {
  const inputSchema = withMeta({
    collection: z.string(),
    id: z.string(),
    changesSummary: z
      .string()
      .min(20)
      .describe(
        'Clear description of what is changing and why, shown to approvers in notifications',
      ),
    requestReason: z
      .string()
      .optional()
      .describe('Optional context about why the change is being made'),
    approverGroups: z
      .array(z.string())
      .min(1)
      .describe('Group slugs the request should be routed to'),
  })

  return {
    name: 'request_approval',
    requiredScope: 'approvals.request',
    description:
      "Kicks off the approval workflow for a document that requires approval before publishing. Provide a clear changesSummary explaining what changed and why; approvers see this in their notifications. Returns the approval ID, expiration time, and the list of approvers who were notified.",
    inputSchema,
    handler: async (input, ctx) => {
      if (!ctx.user) {
        return { error: 'Approval requests must be made by an authenticated user' }
      }

      const approverGroups = input.approverGroups as string[]
      const validGroupSlugs = new Set(deps.options.groups.map((g) => g.slug))
      const unknownGroups = approverGroups.filter((g) => !validGroupSlugs.has(g))
      if (unknownGroups.length > 0) {
        return { error: `Unknown approver groups: ${unknownGroups.join(', ')}` }
      }

      const document = (await deps.payload.findByID({
        collection: input.collection,
        id: input.id,
        draft: true,
      })) as Record<string, unknown> | null
      if (!document) return { error: 'Document not found' }

      const approvers = await deps.options.groupResolver.resolveUsers(approverGroups)
      if (approvers.length === 0) {
        return {
          error: `No approvers found in groups: ${approverGroups.join(', ')}`,
        }
      }

      /*
      What the approval is bound to. A hash of the document's content, not of
      its `updatedAt` — so a save that changed nothing leaves a granted
      approval standing, and one that changed something invalidates it.

      Publishing's approval step hashes the same document the same way, with
      the same function, from a `findByID` with the same arguments. That is
      the only reason the two agree; see `documentContentHash`.
      */
      const targetVersion = await documentContentHash(document)
      const targetTitle =
        typeof document['title'] === 'string' ? document['title'] : input.id
      const slug =
        typeof document['slug'] === 'string' ? document['slug'] : input.id
      const previewUrl = buildPreviewUrl(deps.options, input.collection, slug)

      const expiresAt = new Date(
        Date.now() + (deps.options.expirationDays ?? 7) * 24 * 60 * 60 * 1000,
      ).toISOString()

      const created = (await deps.payload.create({
        collection: deps.options.collectionSlug ?? DEFAULT_APPROVALS_SLUG,
        data: {
          targetCollection: input.collection,
          targetId: input.id,
          targetTitle,
          targetVersion,
          previewUrl,
          requestedBy: ctx.user.id,
          requestedAt: new Date().toISOString(),
          ...(input.requestReason ? { requestReason: input.requestReason } : {}),
          changesSummary: input.changesSummary,
          approverGroups: approverGroups,
          status: 'pending',
          expiresAt,
          notifiedApprovers: approvers.map((a) => a.id),
          consumedTokens: [],
        },
      })) as { id: string | number }

      const approvalId = String(created.id)

      await deps.options.inngest.send({
        name: 'approval/requested',
        data: {
          approvalId,
          targetCollection: input.collection,
          targetId: input.id,
          targetTitle,
          requestedBy: ctx.user.id,
          approverIds: approvers.map((a) => a.id),
          expiresAt,
        },
      })

      await deps.auditWriter({
        ...auditContext(ctx, input._meta),
        action: 'approval.requested',
        mcpServer: 'approvals',
        mcpTool: 'request_approval',
        targetCollection: input.collection,
        targetId: input.id,
        targetTitle,
        changesSummary: input.changesSummary,
        approvalRequestId: approvalId,
        success: true,
      })

      return {
        approvalId,
        status: 'pending',
        expiresAt,
        approvers: approvers.map((a) => ({ id: a.id, name: a.name ?? a.email })),
        previewUrl,
      }
    },
  }
}

function buildPreviewUrl(
  options: ApprovalsPluginOptions,
  collection: string,
  slug: string,
): string {
  const baseUrl = options.publicUrl ?? process.env['NEXT_PUBLIC_SERVER_URL'] ?? ''
  return `${baseUrl.replace(/\/$/, '')}/api/preview?collection=${encodeURIComponent(collection)}&slug=${encodeURIComponent(slug)}`
}

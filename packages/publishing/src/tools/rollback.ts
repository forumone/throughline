import { z } from 'zod'
import type { Payload } from 'payload'
import { type AuditWriter, withMeta } from '@forumone/throughline-core'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { sendEventSafely } from '../events.js'
import { type PublishingPluginOptions, resolveCollection } from '../options.js'
import { resolvePublishingActor } from './actor.js'
import { PUBLISHING_TOOLS } from './descriptors.js'

export interface RollbackToolDeps {
  payload: Payload
  options: PublishingPluginOptions
  auditWriter: AuditWriter
}

export function createRollbackTool(deps: RollbackToolDeps): McpToolDefinition {
  const inputSchema = withMeta({
    collection: z.string(),
    id: z.string().describe('The document ID'),
    versionId: z.string().describe('The version ID to roll the document back to'),
  })

  return {
    ...PUBLISHING_TOOLS.rollback,
    requiredScope: 'publishing.execute',
    inputSchema,
    handler: async (input, ctx) => {
      const actor = resolvePublishingActor(ctx)
      if ('error' in actor) return actor

      const collection = resolveCollection(deps.options, input.collection)

      /*
      Both reads and the restore run as the caller with `overrideAccess: false`.

      This tool had it worst of the five: the version lookup ran at the Local
      API default, and `restoreVersion` was called with no user and no override
      flag at all — so a rollback was a write to a published document that
      consulted nothing. Audit 04 F-02.
      */
      const enforce = { user: actor.enforceAccessAs, overrideAccess: false } as const

      // Confirm the version belongs to this document before restoring.
      const versions = await deps.payload.findVersions({
        collection: collection.slug,
        where: {
          and: [{ id: { equals: input.versionId } }, { parent: { equals: input.id } }],
        },
        limit: 1,
        ...enforce,
      })

      if (!versions.docs[0]) {
        await deps.auditWriter({
          actor: { type: ctx.user ? 'user' : 'system', userId: ctx.user?.id, apiKeyName: ctx.apiKeyName },
          action: 'publishing.rollback',
          mcpServer: 'publishing',
          mcpTool: 'rollback',
          targetCollection: input.collection,
          targetId: input.id,
          success: false,
          errorMessage: 'Version not found for the supplied document',
        })
        return {
          restored: false,
          reason: `Version "${input.versionId}" not found for document "${input.id}" in "${input.collection}"`,
        }
      }

      await deps.payload.restoreVersion({
        collection: collection.slug,
        id: input.versionId,
        ...enforce,
      })

      // The version is already restored; a failed emission must not undo
      // that or lose the audit record below.
      const warning = await sendEventSafely(deps.options.inngest, {
        name: 'content/page.rolled_back',
        data: {
          collection: collection.slug,
          id: input.id,
          rolledBackBy: ctx.user?.id ?? 'system',
          toVersionId: input.versionId,
        },
      })

      await deps.auditWriter({
        actor: {
          type: ctx.user ? 'user' : 'system',
          userId: ctx.user?.id,
          userName: ctx.user?.name,
          apiKeyName: ctx.apiKeyName,
        },
        action: 'publishing.rollback',
        mcpServer: 'publishing',
        mcpTool: 'rollback',
        targetCollection: input.collection,
        targetId: input.id,
        prompt: input._meta?.userPrompt,
        reasoning: input._meta?.reasoning,
        changesSummary: `Rolled back to version ${input.versionId}`,
        success: true,
      })

      return {
        restored: true,
        toVersionId: input.versionId,
        note: 'The restored content is a draft. Call `publish` to make it live.',
        ...(warning ? { warnings: [warning] } : {}),
      }
    },
  }
}

import { z } from 'zod'
import type { Payload } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { withMeta, getAuditWriter } from '@forumone/throughline-core'
import type { ResolvedFormsConfig } from '../options.js'
import {
  FieldSchema,
  validateFieldSet,
  validateSubmitterConfirmation,
  type SubmitterConfirmationConfig,
} from './_field-schema.js'
import { deniedEnvelope, isFormsAuthor } from './access.js'

const inputSchema = withMeta({
  formId: z.string(),
  fields: z.array(FieldSchema).min(1),
})

export interface UpdateFormFieldsDeps {
  payload: Payload
  resolved: ResolvedFormsConfig
}

export function createUpdateFormFieldsTool(
  deps: UpdateFormFieldsDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'update_form_fields',
    description:
      'Replaces the fields on an existing form. Re-runs the same accessibility / submitter-confirmation checks `create_form` runs against the form\'s current submitterConfirmation config so existing email-field references stay valid.',
    inputSchema,
    handler: async (input, ctx) => {
      if (!isFormsAuthor(ctx)) {
        return deniedEnvelope('Only admins and editors can update form fields.')
      }

      const fieldCheck = validateFieldSet(input.fields)
      if (!fieldCheck.ok) return deniedEnvelope(fieldCheck.reason!)

      let existing: Record<string, unknown> | null = null
      try {
        existing = (await deps.payload.findByID({
          collection: deps.resolved.formsCollectionSlug,
          id: input.formId,
        })) as Record<string, unknown> | null
      } catch {
        existing = null
      }
      if (!existing) return deniedEnvelope(`No form with id "${input.formId}".`)

      const policy = (existing['policy'] ?? {}) as Record<string, unknown>
      const submitterConfirmation = (policy['submitterConfirmation'] ?? {}) as SubmitterConfirmationConfig
      const confirmationCheck = validateSubmitterConfirmation(submitterConfirmation, input.fields)
      if (!confirmationCheck.ok) return deniedEnvelope(confirmationCheck.reason!)

      await deps.payload.update({
        collection: deps.resolved.formsCollectionSlug,
        id: input.formId,
        data: { fields: input.fields },
      })

      const auditWriter = getAuditWriter(deps.payload)
      await auditWriter({
        actor: {
          type: 'user',
          ...(ctx.user?.id ? { userId: ctx.user.id } : {}),
          ...(ctx.user?.name ? { userName: ctx.user.name } : {}),
          ...(ctx.apiKeyName ? { apiKeyName: ctx.apiKeyName } : {}),
        },
        action: 'form.updated',
        mcpServer: 'forms',
        mcpTool: 'update_form_fields',
        targetCollection: deps.resolved.formsCollectionSlug,
        targetId: input.formId,
        targetTitle: typeof existing['title'] === 'string' ? (existing['title'] as string) : undefined,
        ...(input._meta?.userPrompt ? { prompt: input._meta.userPrompt } : {}),
        ...(input._meta?.reasoning ? { reasoning: input._meta.reasoning } : {}),
        changesSummary: `Replaced form fields (${input.fields.length} fields).`,
      })

      return { ok: true, formId: input.formId, fieldCount: input.fields.length }
    },
  }
}

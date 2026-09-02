import { z } from 'zod'
import type { Payload } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { auditContext, withMeta, getAuditWriter } from '@forumone/throughline-core'
import type { ResolvedFormsConfig } from '../options.js'
import { validateDestinationLabel } from '../destinations.js'
import { deniedEnvelope, isFormsAuthor } from './access.js'
import { FORMS_TOOLS } from './descriptors.js'

const inputSchema = withMeta({
  formId: z.string(),
  destinationLabels: z.array(z.string()).min(1),
})

export interface UpdateFormDestinationsDeps {
  payload: Payload
  resolved: ResolvedFormsConfig
}

export function createUpdateFormDestinationsTool(
  deps: UpdateFormDestinationsDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    ...FORMS_TOOLS.updateFormDestinations,
    requiredScope: 'forms.manage',
    inputSchema,
    handler: async (input, ctx) => {
      if (!isFormsAuthor(ctx)) {
        return deniedEnvelope('Only admins and editors can update form destinations.')
      }

      const seen = new Set<string>()
      for (const label of input.destinationLabels) {
        if (seen.has(label)) return deniedEnvelope(`Duplicate destination label "${label}".`)
        seen.add(label)
        const check = validateDestinationLabel(deps.resolved.options, label)
        if (!check.ok) return deniedEnvelope(check.reason ?? 'Destination not on the allowlist.')
      }

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

      const policy = ((existing['policy'] ?? {}) as Record<string, unknown>)
      const updatedPolicy = {
        ...policy,
        destinations: input.destinationLabels.map((label) => ({ label, enabled: true })),
      }

      await deps.payload.update({
        collection: deps.resolved.formsCollectionSlug,
        id: input.formId,
        data: { policy: updatedPolicy },
      })

      const auditWriter = getAuditWriter(deps.payload)
      await auditWriter({
        ...auditContext(ctx, input._meta),
        action: 'form.updated',
        mcpServer: 'forms',
        mcpTool: 'update_form_destinations',
        targetCollection: deps.resolved.formsCollectionSlug,
        targetId: input.formId,
        targetTitle: typeof existing['title'] === 'string' ? (existing['title'] as string) : undefined,
        changesSummary: `Set destinations to: ${input.destinationLabels.join(', ')}.`,
      })

      return {
        ok: true,
        formId: input.formId,
        destinations: input.destinationLabels,
      }
    },
  }
}

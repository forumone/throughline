import { z } from 'zod'
import type { Payload } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { auditContext, withMeta, getAuditWriter } from '@forumone/throughline-core'
import type { ResolvedFormsConfig } from '../options.js'
import { validateDestinationLabel } from '../destinations.js'
import {
  FieldSchema,
  validateFieldSet,
  validateSubmitterConfirmation,
} from './_field-schema.js'
import { deniedEnvelope, isFormsAuthor } from './access.js'

const inputSchema = withMeta({
  title: z.string().min(1),
  intent: z
    .string()
    .min(10)
    .describe('Plain-language description of what this form is for. Surfaces in audit + admin.'),
  fields: z.array(FieldSchema).min(1),
  destinationLabels: z
    .array(z.string())
    .min(1)
    .describe('Pre-authorized destination labels. Use list_allowed_destinations first.'),
  submitterConfirmation: z
    .object({
      enabled: z.boolean(),
      emailFieldName: z.string().optional(),
      subject: z.string().optional(),
      body: z.string().optional(),
    })
    .optional(),
  privacyNoticeOverride: z
    .string()
    .optional()
    .describe('Override the plugin-default privacy notice for this form only.'),
})

export interface CreateFormDeps {
  payload: Payload
  resolved: ResolvedFormsConfig
}

export function createCreateFormTool(
  deps: CreateFormDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'create_form',
    description:
      "Creates a form with privacy notice, consent checkbox, and honeypot enabled by default. Destinations must be selected from the allowlist (call list_allowed_destinations first). Field names must be snake_case; every field needs a label (accessibility); submitterConfirmation, if enabled, must point to an existing email-typed field on the form.",
    inputSchema,
    handler: async (input, ctx) => {
      if (!isFormsAuthor(ctx)) {
        return deniedEnvelope('Only admins and editors can create forms.')
      }

      for (const label of input.destinationLabels) {
        const check = validateDestinationLabel(deps.resolved.options, label)
        if (!check.ok) return deniedEnvelope(check.reason ?? 'Destination not on the allowlist.')
      }

      const fieldCheck = validateFieldSet(input.fields)
      if (!fieldCheck.ok) return deniedEnvelope(fieldCheck.reason!)

      const confirmationCheck = validateSubmitterConfirmation(
        input.submitterConfirmation,
        input.fields,
      )
      if (!confirmationCheck.ok) return deniedEnvelope(confirmationCheck.reason!)

      const policy: Record<string, unknown> = {
        privacyNoticeText: input.privacyNoticeOverride ?? deps.resolved.defaultPrivacyNotice,
        requiresExplicitConsent: deps.resolved.requireConsentByDefault,
        consentLabel: 'I agree to the processing of my data as described above.',
        spamProtection: { honeypot: true, rateLimit: deps.resolved.rateLimit },
        destinations: input.destinationLabels.map((label) => ({ label, enabled: true })),
        submitterConfirmation: input.submitterConfirmation ?? { enabled: false },
      }

      const created = (await deps.payload.create({
        collection: deps.resolved.formsCollectionSlug,
        data: {
          title: input.title,
          fields: input.fields,
          policy,
        },
      })) as Record<string, unknown>

      const auditWriter = getAuditWriter(deps.payload)
      await auditWriter({
        ...auditContext(ctx, input._meta),
        action: 'form.created',
        mcpServer: 'forms',
        mcpTool: 'create_form',
        targetCollection: deps.resolved.formsCollectionSlug,
        targetId: String(created['id']),
        targetTitle: input.title,
        changesSummary: `Created form "${input.title}" with ${input.fields.length} fields, destinations: ${input.destinationLabels.join(', ')}.`,
      })

      return {
        formId: String(created['id']),
        title: input.title,
        destinations: input.destinationLabels,
        privacyNotice: 'enabled',
        consent: deps.resolved.requireConsentByDefault,
        honeypot: true,
        submitterConfirmation: input.submitterConfirmation?.enabled ?? false,
      }
    },
  }
}

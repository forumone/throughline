import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import { withMeta } from '@forumone/throughline-core'
import type { FormsPluginOptions } from '../options.js'
import { validateDestinationLabel } from '../destinations.js'
import {
  FieldSchema,
  validateFieldSet,
  validateSubmitterConfirmation,
} from './_field-schema.js'
import { deniedEnvelope, isFormsAuthor } from './access.js'

const inputSchema = withMeta({
  fields: z.array(FieldSchema).min(1),
  destinationLabels: z.array(z.string()).min(1),
  submitterConfirmation: z
    .object({
      enabled: z.boolean(),
      emailFieldName: z.string().optional(),
      subject: z.string().optional(),
      body: z.string().optional(),
    })
    .optional(),
})

export interface ValidateFormDeps {
  options: FormsPluginOptions
}

export function createValidateFormTool(
  deps: ValidateFormDeps,
): McpToolDefinition<typeof inputSchema> {
  return {
    name: 'validate_form',
    description:
      'Runs the same checks `create_form` runs (allowlist, accessibility, submitter-confirmation pointer) without writing anything. Use to confirm a form definition is shippable before persisting it.',
    inputSchema,
    handler: async (input, ctx) => {
      if (!isFormsAuthor(ctx)) {
        return deniedEnvelope('Only admins and editors can validate form definitions.')
      }

      const issues: string[] = []
      for (const label of input.destinationLabels) {
        const check = validateDestinationLabel(deps.options, label)
        if (!check.ok && check.reason) issues.push(check.reason)
      }
      const fieldCheck = validateFieldSet(input.fields)
      if (!fieldCheck.ok && fieldCheck.reason) issues.push(fieldCheck.reason)
      const confirmationCheck = validateSubmitterConfirmation(
        input.submitterConfirmation,
        input.fields,
      )
      if (!confirmationCheck.ok && confirmationCheck.reason) {
        issues.push(confirmationCheck.reason)
      }

      return {
        ok: issues.length === 0,
        issues,
        summary:
          issues.length === 0
            ? 'Form definition passes all checks.'
            : `${issues.length} issue${issues.length === 1 ? '' : 's'} found.`,
      }
    },
  }
}

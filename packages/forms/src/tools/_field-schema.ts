import { z } from 'zod'

const FIELD_BLOCK_TYPES = ['text', 'textarea', 'email', 'select', 'checkbox', 'number'] as const

export type FormFieldBlockType = (typeof FIELD_BLOCK_TYPES)[number]

export const FieldSchema = z.object({
  blockType: z.enum(FIELD_BLOCK_TYPES),
  /**
   * Snake-case identifier. Form Builder's submission rows key on this, so
   * dashes / spaces / unicode would break downstream queries.
   */
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Field names must be snake_case (a-z, 0-9, _)'),
  /** Visible label. Required — accessibility. */
  label: z.string().min(1, 'Field labels are required for accessibility'),
  required: z.boolean().default(false),
  defaultValue: z.string().optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional()
    .describe('Required for select fields; ignored otherwise'),
})

export type FieldDefinition = z.infer<typeof FieldSchema>

/**
 * Hard validation that runs after Zod has parsed the input. Catches the
 * cross-field rules that don't fit cleanly in a per-field schema:
 *  - select fields must carry options
 *  - submitterConfirmation must reference an actual email-typed field
 */
export function validateFieldSet(fields: FieldDefinition[]): { ok: boolean; reason?: string } {
  const seen = new Set<string>()
  for (const field of fields) {
    if (seen.has(field.name)) {
      return { ok: false, reason: `Duplicate field name "${field.name}".` }
    }
    seen.add(field.name)
    if (field.blockType === 'select' && (!field.options || field.options.length === 0)) {
      return { ok: false, reason: `Select field "${field.name}" requires at least one option.` }
    }
  }
  return { ok: true }
}

export interface SubmitterConfirmationConfig {
  enabled: boolean
  emailFieldName?: string | undefined
  subject?: string | undefined
  body?: string | undefined
}

export function validateSubmitterConfirmation(
  config: SubmitterConfirmationConfig | undefined,
  fields: FieldDefinition[],
): { ok: boolean; reason?: string } {
  if (!config?.enabled) return { ok: true }
  if (!config.emailFieldName) {
    return {
      ok: false,
      reason: 'submitterConfirmation.emailFieldName is required when confirmation is enabled.',
    }
  }
  const field = fields.find((f) => f.name === config.emailFieldName)
  if (!field) {
    return {
      ok: false,
      reason: `submitterConfirmation.emailFieldName references "${config.emailFieldName}", which is not in the form's fields.`,
    }
  }
  if (field.blockType !== 'email') {
    return {
      ok: false,
      reason: `submitterConfirmation.emailFieldName must point to a field with blockType="email"; "${field.name}" is "${field.blockType}".`,
    }
  }
  return { ok: true }
}

import { z } from 'zod'

/**
 * The current version of the contract schema. Bump this when making a
 * backwards-incompatible change to the shape. Manifests declare the
 * version they satisfy so the loader can reject mismatches loudly.
 */
export const CONTRACT_VERSION = '1.0.0'

const FieldTypeSchema = z.enum([
  'text',
  'richtext',
  'link',
  'image',
  'video',
  'select',
  'group',
  'array',
  'boolean',
  'number',
])

const PlacementSchema = z.enum(['page', 'section', 'inline'])

const CategorySchema = z.enum([
  'hero',
  'section',
  'card',
  'media',
  'cta',
  'navigation',
  'data',
  'form',
  'utility',
])

export type ContentField = {
  name: string
  type: z.infer<typeof FieldTypeSchema>
  required: boolean
  maxLength?: number | undefined
  constraints?: string | undefined
  of?: ContentField[] | undefined
}

/** Input shape for {@link ContentFieldSchema}: defaulted fields are optional. */
export type ContentFieldInput = {
  name: string
  type: z.infer<typeof FieldTypeSchema>
  required?: boolean | undefined
  maxLength?: number | undefined
  constraints?: string | undefined
  of?: ContentFieldInput[] | undefined
}

const ContentFieldSchema: z.ZodType<ContentField, z.ZodTypeDef, ContentFieldInput> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    type: FieldTypeSchema,
    required: z.boolean().default(false),
    maxLength: z.number().int().positive().optional(),
    /** Human-readable constraint description the AI reasons about. */
    constraints: z.string().optional(),
    /** For array or group fields, the nested field shape. */
    of: z.array(ContentFieldSchema).optional(),
  }),
)

export const ComponentContractSchema = z.object({
  // Identity
  name: z.string().min(1).regex(/^[A-Z][A-Za-z0-9]+$/, 'Component names must be PascalCase'),
  category: CategorySchema,
  description: z.string().min(20).max(280),
  intent: z.string().min(20).max(500),

  // Composition
  composition: z.object({
    placement: z.array(PlacementSchema).nonempty(),
    maxPerPage: z.number().int().positive().nullable().default(null),
    requiredSiblings: z.array(z.string()).default([]),
    forbiddenAdjacent: z.array(z.string()).default([]),
    allowedSlots: z.record(z.string(), z.array(z.string())).optional(),
  }),

  // Content
  content: z.object({
    fields: z.array(ContentFieldSchema),
    variants: z
      .array(
        z.object({
          name: z.string(),
          description: z.string(),
          whenToUse: z.string(),
        }),
      )
      .optional(),
  }),

  // Tokens
  tokens: z.object({
    consumes: z.array(z.string()),
    configurable: z
      .array(
        z.object({
          prop: z.string(),
          tokenGroup: z.string(),
          allowedValues: z.array(z.string()),
        }),
      )
      .optional(),
  }),

  // Accessibility
  accessibility: z.object({
    role: z.string().optional(),
    keyboardSupport: z.array(z.string()).default([]),
    screenReaderBehavior: z.string().min(10),
    contentWarnings: z.array(z.string()).default([]),
  }),

  // Examples
  examples: z
    .array(
      z.object({
        label: z.string(),
        intent: z.string(),
        storyId: z.string(),
      }),
    )
    .min(1, 'Each component must have at least one example'),

  antiExamples: z
    .array(
      z.object({
        label: z.string(),
        why: z.string(),
        useInstead: z.string().optional(),
      }),
    )
    .default([]),

  // Behavioral
  behavior: z
    .object({
      fetchesData: z.boolean().default(false),
      hasClientState: z.boolean().default(false),
      animates: z.boolean().default(false),
      requiresAnalytics: z.boolean().default(false),
    })
    .default({}),
})

export type ComponentContract = z.infer<typeof ComponentContractSchema>
export type ComponentCategory = z.infer<typeof CategorySchema>
export type ComponentPlacement = z.infer<typeof PlacementSchema>
export type ContentFieldType = z.infer<typeof FieldTypeSchema>

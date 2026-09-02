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

/**
 * Where an editor looks for a component, as distinct from what the component
 * *is*.
 *
 * `category` answers the second question and several consumers reason about it
 * as a kind. It is a poor answer to the first: a real design system files
 * roughly half its library under `section`, so a picker grouped on `category`
 * hands back the flat list the grouping was meant to avoid, while `card` and
 * `navigation` hold one entry each. Redistributing within `category` to even
 * the shelves out would file components under the wrong kind for every other
 * consumer.
 *
 * So this is a second, optional field. The values are shelf labels, chosen to
 * split the sections a `category` cannot:
 *
 * - `hero`       — page openers
 * - `narrative`  — sections that explain, walk through, or tell
 * - `proof`      — sections that evidence a claim: testimony, clients, results
 * - `listing`    — collections of records, usually repeating
 * - `media`      — image, video, audio, and their captions
 * - `form`       — anything an editor thinks of as a form
 * - `cta`        — asks
 * - `navigation` — wayfinding within or across pages
 * - `utility`    — structural or incidental
 *
 * There is deliberately no `section`: a shelf that holds half the library is
 * the problem this field exists to solve. There is no `card` or `data` either
 * — both name a kind rather than a place to look, and their contents belong on
 * `listing` and `proof` respectively.
 */
const GroupSchema = z.enum([
  'hero',
  'narrative',
  'proof',
  'listing',
  'media',
  'form',
  'cta',
  'navigation',
  'utility',
])

export type ContentField = {
  name: string
  type: z.infer<typeof FieldTypeSchema>
  required: boolean
  maxLength?: number | undefined
  defaultValue?: boolean | undefined
  constraints?: string | undefined
  of?: ContentField[] | undefined
}

/** Input shape for {@link ContentFieldSchema}: defaulted fields are optional. */
export type ContentFieldInput = {
  name: string
  type: z.infer<typeof FieldTypeSchema>
  required?: boolean | undefined
  maxLength?: number | undefined
  defaultValue?: boolean | undefined
  constraints?: string | undefined
  of?: ContentFieldInput[] | undefined
}

const ContentFieldSchema: z.ZodType<ContentField, z.ZodTypeDef, ContentFieldInput> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    type: FieldTypeSchema,
    required: z.boolean().default(false),
    maxLength: z.number().int().positive().optional(),
    /*
    What the field holds before an author touches it, for `boolean` only.

    A component's own default lives in its signature — `hasFacade = true` — and
    is reachable only when the prop arrives as `undefined`. A generated CMS
    field never leaves it undefined: a checkbox is stored ticked or unticked,
    so the component is always handed an explicit value and its default can
    never apply. Without somewhere to declare it, every boolean a contract
    describes reaches the component as `false`, whatever the component says.

    That inverted `VideoEmbed.hasFacade`, whose whole purpose is to keep a
    provider's iframe and its third-party cookies off the page until a reader
    presses play. The contract said "Leave on"; every embed an author added
    shipped with it off.

    Deliberately boolean-only. `text` and `number` defaults are a different
    question — an empty string and a missing number are already meaningful, and
    a default there competes with `required` rather than completing it. Widen
    this when a component needs it, not before.
    */
    defaultValue: z.boolean().optional(),
    /** Human-readable constraint description the AI reasons about. */
    constraints: z.string().optional(),
    /** For array or group fields, the nested field shape. */
    of: z.array(ContentFieldSchema).optional(),
  }).superRefine((field, ctx) => {
    // Only `boolean` reads `defaultValue`, so anywhere else it is a value the
    // author expects to take effect and nothing ever will. Rejecting it is the
    // difference between a contract that fails validation and a field that
    // quietly ignores half of what it was told.
    if (field.defaultValue !== undefined && field.type !== 'boolean') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultValue'],
        message: `defaultValue is only read for boolean fields; "${field.name}" is ${field.type}.`,
      })
    }
  }),
)

export const ComponentContractSchema = z.object({
  // Identity
  name: z.string().min(1).regex(/^[A-Z][A-Za-z0-9]+$/, 'Component names must be PascalCase'),
  category: CategorySchema,
  /**
   * The shelf an authoring UI files this component under. Optional: when it is
   * absent, {@link groupOf} falls back to {@link category}, so a design system
   * that sets none groups exactly as it did before this field existed.
   */
  group: GroupSchema.optional(),
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
export type ComponentGroup = z.infer<typeof GroupSchema>

/**
 * The shelf a component is filed under: its `group` when set, otherwise its
 * `category`.
 *
 * Anything that groups components should call this rather than reading either
 * field directly, so a design system part-way through adopting `group` groups
 * consistently instead of half one way and half the other. It takes a
 * structural type so it also accepts the looser component shapes consumers
 * carry around, not only a fully parsed {@link ComponentContract}.
 */
export function groupOf(component: { category: string; group?: string | undefined }): string {
  return component.group ?? component.category
}
export type ComponentPlacement = z.infer<typeof PlacementSchema>
export type ContentFieldType = z.infer<typeof FieldTypeSchema>

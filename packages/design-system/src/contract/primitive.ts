import { z } from 'zod'

/*
A primitive: a building block a composed section (a "recipe", forumone-2026#801)
may be made of, but that is never a block on its own.

Layout primitives — a section band, a constrained column, a grid, a stack —
are deliberately absent from `components`, so the CMS can never place a bare
grid on a page as though it were content. A recipe needs them anyway, to say
how its content is arranged. So they get a contract of their own, in a
section of the manifest of their own, which `generateBlocks` never reads.

What a primitive declares is what a recipe may set, and nothing else:

- **props**, each one a closed set. A spacing prop names the tokens it takes,
  an enum its values, a number its range. There is no free-form string, no
  `className`, no `style`: a recipe can only say what the design system
  already lets it say, which is the whole safety argument for letting a
  marketer compose one without a code review.
- **slots**, where other nodes go. A layout primitive has them; a content
  primitive has none.
- **content**, for a content primitive (a heading, a run of text, a button,
  an image): the kind of content field it shows, which a recipe binds to one
  of its own fields.
*/

const TokenPropSchema = z.object({
  type: z.literal('token'),
  /** The token category the values come from, e.g. `spacing`. */
  tokenGroup: z.string().min(1),
  /** The token names allowed, by name without `--`. Every one must exist. */
  allowed: z.array(z.string().min(1)).nonempty(),
  default: z.string().optional(),
  description: z.string().optional(),
})

const EnumPropSchema = z.object({
  type: z.literal('enum'),
  values: z.array(z.union([z.string().min(1), z.number()])).nonempty(),
  default: z.union([z.string(), z.number()]).optional(),
  description: z.string().optional(),
})

const BooleanPropSchema = z.object({
  type: z.literal('boolean'),
  default: z.boolean().optional(),
  description: z.string().optional(),
})

export const PrimitivePropSchema = z.discriminatedUnion('type', [
  TokenPropSchema,
  EnumPropSchema,
  BooleanPropSchema,
])

export type PrimitiveProp = z.infer<typeof PrimitivePropSchema>

export const PrimitiveSlotSchema = z.object({
  description: z.string().min(1),
  /** Whether a recipe must put something here. */
  required: z.boolean().default(false),
  /** At most this many nodes; absent means any number. */
  max: z.number().int().positive().optional(),
})

export type PrimitiveSlot = z.infer<typeof PrimitiveSlotSchema>

/** The content field kinds a content primitive can show. A subset of a contract's field types. */
export const PrimitiveContentTypeSchema = z.enum(['text', 'richtext', 'link', 'image'])

export const PrimitiveContractSchema = z
  .object({
    name: z.string().min(1).regex(/^[A-Z][A-Za-z0-9]+$/, 'Primitive names must be PascalCase'),
    /** `layout` arranges other nodes; `content` shows one content field. */
    kind: z.enum(['layout', 'content']),
    description: z.string().min(20).max(280),
    /** The design-system export it renders, when that differs from `name`. */
    renders: z.string().optional(),
    props: z.record(z.string(), PrimitivePropSchema).default({}),
    /** Where child nodes go, by slot name. `children` is the unnamed one. */
    slots: z.record(z.string(), PrimitiveSlotSchema).default({}),
    /** A content primitive's field: what kind, and whether a recipe must bind one. */
    content: z
      .object({
        type: PrimitiveContentTypeSchema,
        required: z.boolean().default(true),
      })
      .optional(),
  })
  .superRefine((primitive, ctx) => {
    if (primitive.kind === 'content' && !primitive.content) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: `"${primitive.name}" is a content primitive, so it says what kind of content it shows.`,
      })
    }
    if (primitive.kind === 'content' && Object.keys(primitive.slots).length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slots'],
        message: `"${primitive.name}" is a content primitive, so nothing nests inside it.`,
      })
    }
    if (primitive.kind === 'layout' && primitive.content) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: `"${primitive.name}" is a layout primitive: its content is what its slots hold.`,
      })
    }
    if (primitive.kind === 'layout' && Object.keys(primitive.slots).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slots'],
        message: `"${primitive.name}" is a layout primitive with nowhere to put anything.`,
      })
    }
    for (const [name, prop] of Object.entries(primitive.props)) {
      if (prop.type === 'enum' && prop.default !== undefined && !prop.values.includes(prop.default)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['props', name, 'default'],
          message: `The default "${prop.default}" is not one of "${name}"'s values.`,
        })
      }
      if (prop.type === 'token' && prop.default !== undefined && !prop.allowed.includes(prop.default)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['props', name, 'default'],
          message: `The default "${prop.default}" is not one of the tokens "${name}" allows.`,
        })
      }
    }
  })

export type PrimitiveContract = z.infer<typeof PrimitiveContractSchema>
/** What an author writes in a `.primitive.ts`, before defaults are applied. */
export type PrimitiveContractInput = z.input<typeof PrimitiveContractSchema>

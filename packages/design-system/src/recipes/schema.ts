import { z } from 'zod'
import type { ComponentContractSchema } from '../contract/schema.js'

/*
A recipe: a component stored as data instead of code (forumone-2026#801).

Two parts. A provisional `ComponentContract` — the same schema every real
component's contract satisfies, so "the contract for a component that does not
exist yet" really is one — whose `content.fields` are the section's editable
fields. And a tree of nodes that says how those fields are arranged, made only
of what the manifest already offers:

- a **primitive** node — a layout (`Section`, `Stack`, `Grid`…) with its props
  and the nodes in its slots, or a content piece (`Heading`, `Text`, `Image`)
  bound to one of the recipe's fields;
- a **component** node — an existing component whose contract allows it inline,
  its fields bound to the recipe's.

Every word on the rendered section comes from a binding, `{ field: "<name>" }`.
Every visual setting is a value the primitive declares. There is no class name,
no style, no markup and no script anywhere in the shape, so a recipe can only
produce what the design system already could.

This file is the structure. Whether a structure is *allowed* — the primitive
exists, the prop value is one it offers, the field is declared — needs the
manifest, and is `lint.ts`.
*/

/** A reference to one of the recipe's own content fields. */
export interface Binding {
  field: string
}

export interface PrimitiveNode {
  primitive: string
  props?: Record<string, string | number | boolean> | undefined
  /** A layout primitive's children, by slot name; `children` is the unnamed one. */
  slots?: Record<string, RecipeNode[]> | undefined
  /** A content primitive's field. */
  content?: Binding | undefined
}

export interface ComponentNode {
  component: string
  /**
   * The component's content fields, by name. A text-like field is always a
   * binding; a `select` or `boolean` may be a literal, because choosing a
   * variant is arrangement rather than content.
   */
  fields: Record<string, Binding | string | number | boolean>
}

export type RecipeNode = PrimitiveNode | ComponentNode

export interface Recipe {
  contract: z.input<typeof ComponentContractSchema>
  tree: RecipeNode
}

const BindingSchema = z.object({ field: z.string().min(1) }).strict()

const PropValueSchema = z.union([z.string(), z.number(), z.boolean()])

export const RecipeNodeSchema: z.ZodType<RecipeNode> = z.lazy(() =>
  z.union([
    z
      .object({
        primitive: z.string().min(1),
        props: z.record(z.string(), PropValueSchema).optional(),
        slots: z.record(z.string(), z.array(RecipeNodeSchema)).optional(),
        content: BindingSchema.optional(),
      })
      .strict(),
    z
      .object({
        component: z.string().min(1),
        fields: z.record(z.string(), z.union([BindingSchema, PropValueSchema])),
      })
      .strict(),
  ]),
)

/**
 * The shape of a recipe. Strict throughout: a key the shape does not name —
 * `className`, `style`, `html` — is refused rather than ignored, because an
 * ignored key is one an author believes did something.
 */
export const RecipeSchema = z
  .object({
    // Checked in full by the lint, against ComponentContractSchema.
    contract: z.record(z.string(), z.unknown()),
    tree: RecipeNodeSchema,
  })
  .strict()

export function isBinding(value: unknown): value is Binding {
  return Boolean(value) && typeof value === 'object' && typeof (value as Binding).field === 'string'
}

export function isComponentNode(node: RecipeNode): node is ComponentNode {
  return 'component' in node
}

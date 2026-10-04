import { Fragment, type ComponentType, type JSX, type ReactNode } from 'react'
import type { ContentField as ContractField } from '../contract/schema.js'
import type { ContentField } from '../generate/fields.js'
import { coerceBlock, type CoerceContext } from '../render/coerce.js'
import { isBinding, isComponentNode, type Recipe, type RecipeNode } from './schema.js'

/*
Draws a recipe as design-system components.

An interpreter, not a compiler: it walks the tree and looks each node up in
what the host hands it — the primitives' components, the registry of real
components, the same `CoerceContext` blocks render with — so a recipe can never
produce markup the design system could not. It renders only what `lintRecipe`
allows and assumes it was linted; given something it cannot resolve, it draws
nothing for that node rather than throwing, as `RenderBlocks` does for an
unknown block.

Content arrives as the values of the recipe's own fields, by name. A text
field becomes a content primitive's children, an image goes through
`resolveMedia` and arrives as `src` and `alt`, and a component node's fields go
through `coerceBlock` with the component's contract, exactly as its block would.
*/

type AnyComponent = ComponentType<Record<string, unknown>>

export interface RenderRecipeProps {
  recipe: Recipe
  /** The section's content: one value per field the recipe declares. */
  content: Readonly<Record<string, unknown>>
  /** Primitive name → the component that draws it. */
  primitives: Readonly<Record<string, AnyComponent>>
  /** Component name → the component, as `RenderBlocks` takes it. */
  registry: Readonly<Record<string, AnyComponent>>
  /** Component name → its contract's fields, for `coerceBlock`. */
  fields: Readonly<Record<string, ContentField[]>>
  /** The same context blocks render with: media, links and rich text are the host's. */
  context: CoerceContext
}

export function RenderRecipe(props: RenderRecipeProps): JSX.Element | null {
  return <>{draw(props.recipe.tree, props, 'r')}</>
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function draw(node: RecipeNode, ctx: RenderRecipeProps, key: string): ReactNode {
  if (isComponentNode(node)) {
    const Component = ctx.registry[node.component]
    const contractFields = ctx.fields[node.component]
    if (!Component || !contractFields) return null
    const data: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(node.fields)) {
      data[name] = isBinding(value) ? ctx.content[value.field] : value
    }
    return <Component key={key} {...coerceBlock(node.component, contractFields, data, ctx.context)} />
  }

  const Primitive = ctx.primitives[node.primitive]
  if (!Primitive) return null
  const props: Record<string, unknown> = { ...node.props }

  if (node.content) {
    const value = ctx.content[node.content.field]
    if (isEmpty(value)) return null
    const field = ctx.recipe.contract.content.fields.find(
      (f: { name: string }) => f.name === node.content!.field,
    ) as ContractField | undefined
    switch (field?.type) {
      case 'image': {
        const media = ctx.context.resolveMedia(value, {
          component: ctx.recipe.contract.name,
          path: node.content.field,
        })
        if (!media?.url) return null
        return <Primitive key={key} {...props} src={media.url} alt={media.alt ?? ''} />
      }
      case 'richtext':
        return (
          <Primitive key={key} {...props}>
            {ctx.context.renderRichText(value)}
          </Primitive>
        )
      default:
        return <Primitive key={key} {...props}>{String(value)}</Primitive>
    }
  }

  const slots = node.slots ?? {}
  for (const [name, children] of Object.entries(slots)) {
    const drawn = children.map((child, index) => draw(child, ctx, `${key}.${name}${index}`))
    if (name === 'children') continue
    props[name] = <Fragment>{drawn}</Fragment>
  }
  const children = (slots['children'] ?? []).map((child, index) =>
    draw(child, ctx, `${key}.c${index}`),
  )
  return (
    <Primitive key={key} {...props}>
      {children.length > 0 ? children : undefined}
    </Primitive>
  )
}

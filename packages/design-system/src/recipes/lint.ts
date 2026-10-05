import type { Manifest } from '../contract/manifest.js'
import type { PrimitiveContract } from '../contract/primitive.js'
import { ComponentContractSchema, type ContentField } from '../contract/schema.js'
import {
  RecipeSchema,
  isBinding,
  isComponentNode,
  type Recipe,
  type RecipeNode,
} from './schema.js'

/*
The rules every recipe follows, in place of a code review.

A component reaches the CMS after a person has read its code. A recipe reaches
it from a marketer's conversation with Claude, minutes later, so what a review
would have checked has to be checked here, every time, against the manifest as
it is now — a token renamed since a recipe was saved shows up as an error the
next time it is linted, which is what the publish gate does.

Each issue names the node by its path in the tree (`tree.slots.children[1]`),
so an agent can fix it and try again.
*/

export interface RecipeIssue {
  severity: 'error' | 'warning'
  /** Where: `contract`, `tree`, `tree.slots.children[2].props.gap`. */
  path: string
  rule: string
  message: string
}

/** The most deeply nested a node may be, counting the root as 1. */
export const MAX_DEPTH = 6
/** The most nodes a recipe may have. */
export const MAX_NODES = 60

/** Which content field types each content primitive can show. */
const SHOWS: Readonly<Record<string, readonly string[]>> = {
  text: ['text'],
  richtext: ['richtext'],
  image: ['image'],
  link: ['link'],
}

interface Walk {
  manifest: Manifest
  fields: ReadonlyMap<string, ContentField>
  used: Set<string>
  issues: RecipeIssue[]
  nodes: number
  /** Heading levels in document order, with where each one is. */
  headings: { level: number; path: string }[]
}

function error(walk: Walk, path: string, rule: string, message: string): void {
  walk.issues.push({ severity: 'error', path, rule, message })
}

/**
 * Lints a recipe against the manifest. An empty array is a recipe that may be
 * saved; any error is one that may not.
 */
export function lintRecipe(input: unknown, manifest: Manifest): RecipeIssue[] {
  const shape = RecipeSchema.safeParse(input)
  if (!shape.success) {
    return shape.error.issues.map((issue) => ({
      severity: 'error' as const,
      path: issue.path.join('.') || '(recipe)',
      rule: 'shape',
      message: issue.message,
    }))
  }
  const recipe = input as Recipe
  const issues: RecipeIssue[] = []

  const contract = ComponentContractSchema.safeParse(recipe.contract)
  if (!contract.success) {
    for (const issue of contract.error.issues) {
      issues.push({
        severity: 'error',
        path: ['contract', ...issue.path].join('.'),
        rule: 'contract',
        message: issue.message,
      })
    }
    return issues
  }
  const c = contract.data

  if (c.name in manifest.components || c.name in (manifest.primitives ?? {})) {
    issues.push({
      severity: 'error',
      path: 'contract.name',
      rule: 'contract.name',
      message: `"${c.name}" is already a component or primitive in the design system.`,
    })
  }
  if (c.intent.length < 50) {
    issues.push({
      severity: 'error',
      path: 'contract.intent',
      rule: 'contract.intent',
      message: 'The intent says too little to compose with: at least 50 characters on when to use it.',
    })
  }
  if (c.antiExamples.length === 0) {
    issues.push({
      severity: 'error',
      path: 'contract.antiExamples',
      rule: 'contract.antiExamples',
      message: 'Say at least once when not to use it, and what to use instead.',
    })
  }
  if (c.composition.placement.join() !== 'section') {
    issues.push({
      severity: 'error',
      path: 'contract.composition.placement',
      rule: 'contract.placement',
      message: 'A recipe is a section of a page: its placement is ["section"].',
    })
  }

  const walk: Walk = {
    manifest,
    fields: new Map(c.content.fields.map((field) => [field.name, field])),
    used: new Set(),
    issues,
    nodes: 0,
    headings: [],
  }

  const root = manifest.primitives?.[(recipe.tree as { primitive?: string }).primitive ?? '']
  if (!root || root.kind !== 'layout') {
    error(walk, 'tree', 'tree.root', 'The root of a recipe is a layout primitive, usually a Section.')
  }

  lintNode(recipe.tree, 'tree', 1, walk)

  if (walk.nodes > MAX_NODES) {
    error(walk, 'tree', 'tree.size', `${walk.nodes} nodes; a recipe has at most ${MAX_NODES}.`)
  }

  lintRhythm(recipe.tree, 'tree', new Map(), walk)

  let previous = 1
  for (const heading of walk.headings) {
    if (heading.level > previous + 1) {
      error(
        walk,
        heading.path,
        'headings.order',
        `An h${heading.level} after an h${previous} skips a level.`,
      )
    }
    previous = heading.level
  }

  for (const field of c.content.fields) {
    if (!walk.used.has(field.name)) {
      error(
        walk,
        `contract.content.fields.${field.name}`,
        'fields.unused',
        `"${field.name}" is declared but nothing shows it.`,
      )
    }
  }
  return issues
}

function lintNode(node: RecipeNode, path: string, depth: number, walk: Walk): void {
  walk.nodes += 1
  if (depth > MAX_DEPTH) {
    error(walk, path, 'tree.depth', `Nested ${depth} deep; a recipe is at most ${MAX_DEPTH}.`)
    return
  }
  if (isComponentNode(node)) {
    lintComponent(node, path, walk)
    return
  }

  const primitive = walk.manifest.primitives?.[node.primitive]
  if (!primitive) {
    const known = Object.keys(walk.manifest.primitives ?? {}).join(', ')
    error(walk, path, 'primitive.unknown', `There is no primitive "${node.primitive}". Primitives: ${known}.`)
    return
  }

  lintProps(primitive, node.props ?? {}, path, walk)

  if (primitive.kind === 'content') {
    if (node.slots && Object.keys(node.slots).length > 0) {
      error(walk, `${path}.slots`, 'slots.content', `${primitive.name} shows one field; nothing nests inside it.`)
    }
    lintContentBinding(primitive, node.content, path, walk)
    if (primitive.name === 'Heading') {
      const level = Number(node.props?.['level'] ?? primitive.props['level']?.default ?? 2)
      walk.headings.push({ level, path })
    }
    return
  }

  if (node.content) {
    error(walk, `${path}.content`, 'content.layout', `${primitive.name} arranges nodes; it does not show a field.`)
  }
  const slots = node.slots ?? {}
  for (const name of Object.keys(slots)) {
    if (!(name in primitive.slots)) {
      error(
        walk,
        `${path}.slots.${name}`,
        'slots.unknown',
        `${primitive.name} has no slot "${name}". Slots: ${Object.keys(primitive.slots).join(', ')}.`,
      )
    }
  }
  for (const [name, slot] of Object.entries(primitive.slots)) {
    const children = slots[name] ?? []
    if (slot.required && children.length === 0) {
      error(walk, `${path}.slots.${name}`, 'slots.required', `${primitive.name}'s "${name}" needs something in it.`)
    }
    if (slot.max !== undefined && children.length > slot.max) {
      error(walk, `${path}.slots.${name}`, 'slots.max', `${primitive.name}'s "${name}" holds at most ${slot.max}.`)
    }
    children.forEach((child, index) => lintNode(child, `${path}.slots.${name}[${index}]`, depth + 1, walk))
  }
}

function lintProps(
  primitive: PrimitiveContract,
  props: Record<string, string | number | boolean>,
  path: string,
  walk: Walk,
): void {
  for (const [name, value] of Object.entries(props)) {
    const here = `${path}.props.${name}`
    const prop = primitive.props[name]
    if (!prop) {
      const known = Object.keys(primitive.props)
      error(
        walk,
        here,
        'props.unknown',
        `${primitive.name} has no prop "${name}".${known.length ? ` Props: ${known.join(', ')}.` : ' It takes none.'}`,
      )
      continue
    }
    if (prop.type === 'token' && !(prop.allowed as readonly unknown[]).includes(value)) {
      error(
        walk,
        here,
        'props.token',
        `"${String(value)}" is not a ${prop.tokenGroup} token ${primitive.name}.${name} allows. Allowed: ${prop.allowed.join(', ')}.`,
      )
    }
    if (prop.type === 'enum' && !(prop.values as readonly unknown[]).includes(value)) {
      error(
        walk,
        here,
        'props.enum',
        `"${String(value)}" is not one of ${primitive.name}.${name}'s values: ${prop.values.join(', ')}.`,
      )
    }
    if (prop.type === 'boolean' && typeof value !== 'boolean') {
      error(walk, here, 'props.boolean', `${primitive.name}.${name} is true or false.`)
    }
  }
}

function lintContentBinding(
  primitive: PrimitiveContract,
  binding: { field: string } | undefined,
  path: string,
  walk: Walk,
): void {
  const kind = primitive.content!
  if (!binding) {
    if (kind.required) {
      error(walk, `${path}.content`, 'content.binding', `${primitive.name} shows a field: bind one with { field: "<name>" }.`)
    }
    return
  }
  const field = bound(binding.field, `${path}.content`, walk)
  if (!field) return
  if (!SHOWS[kind.type]?.includes(field.type)) {
    error(
      walk,
      `${path}.content`,
      'content.type',
      `${primitive.name} shows a ${kind.type} field; "${field.name}" is ${field.type}.`,
    )
  }
  if (field.type === 'image' && !field.required) {
    error(
      walk,
      `${path}.content`,
      'images.alt',
      `"${field.name}" is an image a page could show empty. Make it required, so every image on the section is chosen, with its alt text, from the media library.`,
    )
  }
}

function lintComponent(
  node: { component: string; fields: Record<string, unknown> },
  path: string,
  walk: Walk,
): void {
  const component = walk.manifest.components[node.component]
  if (!component) {
    error(walk, path, 'component.unknown', `There is no component "${node.component}".`)
    return
  }
  if (!component.composition.placement.includes('inline')) {
    error(
      walk,
      path,
      'component.placement',
      `${node.component} is placed on a ${component.composition.placement.join(' or ')}, not inside a section. Use a primitive, or a component placed inline.`,
    )
  }
  const own = new Map(component.content.fields.map((field) => [field.name, field]))
  const variants = new Set((component.content.variants ?? []).map((variant) => variant.name))

  for (const [name, value] of Object.entries(node.fields)) {
    const here = `${path}.fields.${name}`
    const field = own.get(name)
    if (!field) {
      error(walk, here, 'component.field', `${node.component} has no field "${name}".`)
      continue
    }
    if (isBinding(value)) {
      const recipeField = bound(value.field, here, walk)
      if (recipeField && recipeField.type !== field.type) {
        error(
          walk,
          here,
          'component.fieldType',
          `${node.component}.${name} is ${field.type}; "${recipeField.name}" is ${recipeField.type}.`,
        )
      }
      continue
    }
    const literalOk =
      (field.type === 'boolean' && typeof value === 'boolean') ||
      (field.type === 'select' && typeof value === 'string' && variants.has(value))
    if (!literalOk) {
      error(
        walk,
        here,
        'component.literal',
        field.type === 'select'
          ? `"${String(value)}" is not one of ${node.component}'s variants: ${[...variants].join(', ') || 'none declared'}.`
          : `Every word on a recipe comes from its content fields: bind ${node.component}.${name} with { field: "<name>" }.`,
      )
    }
  }
  for (const field of component.content.fields) {
    if (field.required && !(field.name in node.fields)) {
      error(
        walk,
        `${path}.fields.${field.name}`,
        'component.required',
        `${node.component}.${field.name} is required.${field.type === 'link' ? ' A link needs a label and a destination.' : ''}`,
      )
    }
  }
}

function bound(name: string, path: string, walk: Walk): ContentField | undefined {
  const field = walk.fields.get(name)
  if (!field) {
    error(walk, path, 'fields.undeclared', `"${name}" is not one of the recipe's content fields.`)
    return undefined
  }
  walk.used.add(name)
  return field
}

/*
Things that belong together sit closer than the things around them.

A Stack inside a Stack is a group inside a larger arrangement: a column's
heading and text, inside a section's heading, columns and button. If the inner
gap is as wide as the outer one, the eye cannot tell which text belongs to
which heading, and the section reads as an even list of lines. That is the
failure in forumone-2026#847, where it was the margins rather than the gaps,
and it is the one an agent choosing gaps one Stack at a time can make on its
own. A layout nested in one of the same kind, spaced along the same axis, must
use a smaller gap than the one around it.

Only the same kind is compared: a Cluster's gap runs across, a Stack's down,
and a Grid's is the site's gutter. Gaps are compared by their step on the
spacing scale, the number at the end of the token's name; a token without one
is not compared.
*/
function gapStep(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = /-(\d+)$/.exec(value)
  return match ? Number(match[1]) : undefined
}

function lintRhythm(
  node: RecipeNode,
  path: string,
  around: ReadonlyMap<string, { gap: string; step: number; path: string }>,
  walk: Walk,
): void {
  if (isComponentNode(node)) return
  const primitive = walk.manifest.primitives?.[node.primitive]
  if (!primitive) return

  let inner = around
  const gapProp = primitive.props['gap']
  if (gapProp && gapProp.type === 'token') {
    const gap = String(node.props?.['gap'] ?? gapProp.default ?? '')
    const step = gapStep(gap)
    if (step !== undefined) {
      const outer = around.get(primitive.name)
      if (outer && step >= outer.step) {
        error(
          walk,
          `${path}.props.gap`,
          'spacing.rhythm',
          `This ${primitive.name}'s ${gap} is as wide as or wider than the ${outer.gap} of the ${primitive.name} around it, so nothing in it reads as belonging together. Make it smaller than ${outer.gap}: a heading and its text are usually spacing-2.`,
        )
      }
      inner = new Map(around).set(primitive.name, { gap, step, path })
    }
  }

  for (const [name, children] of Object.entries(node.slots ?? {})) {
    children.forEach((child, index) => lintRhythm(child, `${path}.slots.${name}[${index}]`, inner, walk))
  }
}

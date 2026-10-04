import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { CoerceContext } from '../render/coerce.js'
import type { ContentField } from '../generate/fields.js'
import { button, goodRecipe } from './_fixtures.js'
import { RenderRecipe } from './render.js'
import type { PrimitiveNode } from './schema.js'

/*
The interpreter draws the tree with the components it is handed, and nothing
else. Asserted on the element tree it returns — which component, which props,
which children — so no DOM is needed and the test reads as the tree does.
*/

const Section = (props: Record<string, unknown>) => props['children'] as ReactNode
const Stack = (props: Record<string, unknown>) => props['children'] as ReactNode
const TwoColumn = (props: Record<string, unknown>) => props['start'] as ReactNode
const Heading = (props: Record<string, unknown>) => props['children'] as ReactNode
const Text = (props: Record<string, unknown>) => props['children'] as ReactNode
const Image = () => null
const Button = () => null

const context: CoerceContext = {
  overrides: {} as CoerceContext['overrides'],
  resolveMedia: (value) => (value === 7 ? { url: '/media/chart.png', alt: 'A rising chart' } : null),
  resolveHref: (link) => (link as { url?: string }).url,
  renderRichText: () => 'rich',
  renderIcon: () => null,
}

const content = {
  heading: 'Ninety percent faster',
  body: 'Agencies we work with ship in weeks.',
  photo: 7,
  ctaLabel: 'Read the study',
  ctaHref: { url: '/work/study' },
}

function drawn(overrides: Partial<Parameters<typeof RenderRecipe>[0]> = {}): ReactElement {
  const out = RenderRecipe({
    recipe: goodRecipe(),
    content,
    primitives: { Section, Stack, TwoColumn, Heading, Text, Image } as never,
    registry: { Button } as never,
    fields: { Button: button.content.fields as unknown as ContentField[] },
    context,
    ...overrides,
  })
  return (out as ReactElement<{ children: ReactElement }>).props.children
}

const kids = (element: ReactElement): ReactElement[] => {
  const children = (element.props as { children?: unknown }).children
  return (Array.isArray(children) ? children : [children]).filter(isValidElement) as ReactElement[]
}

describe('RenderRecipe', () => {
  it('draws the root with its props, and its children in its children slot', () => {
    const root = drawn()
    expect(root.type).toBe(Section)
    expect(root.props).toMatchObject({ variant: 'dark' })
    expect(kids(root)[0]!.type).toBe(TwoColumn)
  })

  it('hands a named slot to its primitive as a prop', () => {
    const two = kids(drawn())[0]!
    const props = two.props as { start: ReactElement; end: ReactElement }
    expect(isValidElement(props.start)).toBe(true)
    expect(kids(props.end)[0]!.type).toBe(Image)
  })

  it('puts a text field’s value in a content primitive, with the primitive’s props', () => {
    const two = kids(drawn())[0]!
    const stack = kids((two.props as { start: ReactElement }).start)[0]!
    expect(stack.props).toMatchObject({ gap: 'spacing-4' })
    const [heading, text, cta] = kids(stack)
    expect(heading!.type).toBe(Heading)
    expect(heading!.props).toMatchObject({ level: 2, children: 'Ninety percent faster' })
    expect(text!.props).toMatchObject({ children: 'Agencies we work with ship in weeks.' })
    expect(cta!.type).toBe(Button)
  })

  it('gives an image its media, through the host’s resolver, as src and alt', () => {
    const two = kids(drawn())[0]!
    const image = kids((two.props as { end: ReactElement }).end)[0]!
    expect(image.props).toEqual({ src: '/media/chart.png', alt: 'A rising chart' })
  })

  it('coerces a component’s bound fields as its block would be, keeping a variant literal', () => {
    const two = kids(drawn())[0]!
    const stack = kids((two.props as { start: ReactElement }).start)[0]!
    const cta = kids(stack)[2]!
    expect(cta.props).toMatchObject({ label: 'Read the study', href: '/work/study', style: 'primary' })
  })

  it('draws nothing for an empty field, rather than an empty heading', () => {
    const two = kids(drawn({ content: { ...content, heading: '' } }))[0]!
    const stack = kids((two.props as { start: ReactElement }).start)[0]!
    expect(kids(stack).map((k) => k.type)).toEqual([Text, Button])
  })

  it('draws nothing for a node it cannot resolve, and the rest of the section still renders', () => {
    const recipe = goodRecipe()
    ;(recipe.tree as PrimitiveNode).slots!['children']!.push({ primitive: 'Marquee', content: { field: 'body' } })
    const root = drawn({ recipe })
    expect(kids(root).map((k) => k.type)).toEqual([TwoColumn])
  })
})

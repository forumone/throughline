import { describe, expect, it } from 'vitest'
import { goodRecipe, recipeManifest } from './_fixtures.js'
import { MAX_NODES, lintRecipe } from './lint.js'
import type { PrimitiveNode, Recipe, RecipeNode } from './schema.js'

/*
The issue's list of deliberately bad recipes (forumone-2026#801): each fails,
with an error that says where and what to do instead. And the good ones pass.
*/

const manifest = recipeManifest()

/** The good recipe, with one change made to it. */
function variant(change: (recipe: Recipe) => void): Recipe {
  const recipe = goodRecipe()
  change(recipe)
  return recipe
}

const stackOf = (r: Recipe) =>
  ((r.tree as PrimitiveNode).slots!['children']![0] as PrimitiveNode).slots!['start']![0] as PrimitiveNode

function errors(recipe: unknown) {
  return lintRecipe(recipe, manifest).filter((issue) => issue.severity === 'error')
}

describe('a good recipe', () => {
  it('passes', () => {
    expect(lintRecipe(goodRecipe(), manifest)).toEqual([])
  })

  it('passes with a boolean literal and a declared variant on a component', () => {
    const recipe = variant((r) => {
      const button = stackOf(r).slots!['children']![2] as { fields: Record<string, unknown> }
      button.fields['external'] = true
      button.fields['style'] = 'secondary'
    })
    expect(errors(recipe)).toEqual([])
  })
})

describe('a bad recipe fails, saying where and why', () => {
  it.each<[string, (r: Recipe) => void, string, RegExp]>([
    [
      'a raw hex colour in a prop',
      (r) => {
        stackOf(r).props = { gap: '#ff0000' }
      },
      'props.token',
      /"#ff0000" is not a spacing token Stack\.gap allows\. Allowed: spacing-2, spacing-4, spacing-8/,
    ],
    [
      'a token since renamed',
      (r) => {
        stackOf(r).props = { gap: 'spacing-3' }
      },
      'props.token',
      /"spacing-3" is not a spacing token/,
    ],
    [
      'an unknown primitive',
      (r) => {
        stackOf(r).slots!['children']!.push({ primitive: 'Marquee', content: { field: 'body' } })
      },
      'primitive.unknown',
      /no primitive "Marquee"\. Primitives: Section, Stack/,
    ],
    [
      'an h1',
      (r) => {
        ;(stackOf(r).slots!['children']![0] as PrimitiveNode).props = { level: 1 }
      },
      'props.enum',
      /"1" is not one of Heading\.level's values: 2, 3, 4/,
    ],
    [
      'a skipped heading level',
      (r) => {
        ;(stackOf(r).slots!['children']![0] as PrimitiveNode).props = { level: 4 }
      },
      'headings.order',
      /An h4 after an h1 skips a level/,
    ],
    [
      'an image that could be empty, so without alt text',
      (r) => {
        r.contract.content.fields[2] = { name: 'photo', type: 'image', required: false }
      },
      'images.alt',
      /"photo" is an image a page could show empty/,
    ],
    [
      'a binding to an undeclared field',
      (r) => {
        ;(stackOf(r).slots!['children']![1] as PrimitiveNode).content = { field: 'subtitle' }
      },
      'fields.undeclared',
      /"subtitle" is not one of the recipe's content fields/,
    ],
    [
      'a component where its placement does not allow it',
      (r) => {
        stackOf(r).slots!['children']!.push({ component: 'Hero', fields: { headline: { field: 'heading' } } })
      },
      'component.placement',
      /Hero is placed on a page, not inside a section/,
    ],
    [
      'more nodes than allowed',
      (r) => {
        const many: RecipeNode[] = Array.from({ length: MAX_NODES }, () => ({
          primitive: 'Text',
          content: { field: 'body' },
        }))
        stackOf(r).slots!['children']!.push(...many)
      },
      'tree.size',
      /nodes; a recipe has at most 60/,
    ],
    [
      'a declared field nothing shows',
      (r) => {
        r.contract.content.fields.push({ name: 'eyebrow', type: 'text' })
      },
      'fields.unused',
      /"eyebrow" is declared but nothing shows it/,
    ],
    [
      'a text literal on a component, rather than a field',
      (r) => {
        ;(stackOf(r).slots!['children']![2] as { fields: Record<string, unknown> }).fields['label'] = 'Click here'
      },
      'component.literal',
      /Every word on a recipe comes from its content fields/,
    ],
    [
      'a variant the component does not declare',
      (r) => {
        ;(stackOf(r).slots!['children']![2] as { fields: Record<string, unknown> }).fields['style'] = 'neon'
      },
      'component.literal',
      /"neon" is not one of Button's variants: primary, secondary/,
    ],
    [
      'a component missing a required field, such as a link with no destination',
      (r) => {
        delete (stackOf(r).slots!['children']![2] as { fields: Record<string, unknown> }).fields['href']
      },
      'component.required',
      /Button\.href is required\. A link needs a label and a destination/,
    ],
    [
      'a binding of the wrong kind',
      (r) => {
        ;((r.tree as PrimitiveNode).slots!['children']![0] as PrimitiveNode).slots!['end'] = [
          { primitive: 'Image', content: { field: 'body' } },
        ]
      },
      'content.type',
      /Image shows a image field; "body" is text/,
    ],
    [
      'a slot that holds more than it may',
      (r) => {
        const two = (r.tree as PrimitiveNode).slots!['children']![0] as PrimitiveNode
        two.slots!['end']!.push({ primitive: 'Text', content: { field: 'body' } })
      },
      'slots.max',
      /TwoColumn's "end" holds at most 1/,
    ],
    [
      'a required slot left empty',
      (r) => {
        ;((r.tree as PrimitiveNode).slots!['children']![0] as PrimitiveNode).slots!['end'] = []
      },
      'slots.required',
      /TwoColumn's "end" needs something in it/,
    ],
    [
      'an intent too thin to compose with',
      (r) => {
        r.contract.intent = 'A band with stats in it, for pages.'
      },
      'contract.intent',
      /at least 50 characters/,
    ],
    [
      'no anti-examples',
      (r) => {
        r.contract.antiExamples = []
      },
      'contract.antiExamples',
      /when not to use it/,
    ],
    [
      'a name a component already has',
      (r) => {
        r.contract.name = 'Button'
      },
      'contract.name',
      /"Button" is already a component or primitive/,
    ],
    [
      'a root that is not a layout',
      (r) => {
        r.tree = { primitive: 'Heading', content: { field: 'heading' } }
      },
      'tree.root',
      /root of a recipe is a layout primitive/,
    ],
  ])('%s', (_, change, rule, message) => {
    const found = errors(variant(change))
    expect(found.map((issue) => issue.rule)).toContain(rule)
    expect(found.find((issue) => issue.rule === rule)!.message).toMatch(message)
  })

  it('refuses a key the shape does not have, such as a class name or a style', () => {
    const recipe = variant((r) => {
      ;(stackOf(r) as unknown as Record<string, unknown>)['className'] = 'u-red'
    })
    expect(errors(recipe)).toEqual([expect.objectContaining({ rule: 'shape' })])
    const styled = variant((r) => {
      ;(r.tree as unknown as Record<string, unknown>)['style'] = { color: 'red' }
    })
    expect(errors(styled)).toEqual([expect.objectContaining({ rule: 'shape' })])
  })

  it('says where, by path in the tree', () => {
    const [issue] = errors(
      variant((r) => {
        stackOf(r).props = { gap: '#ff0000' }
      }),
    )
    expect(issue!.path).toBe('tree.slots.children[0].slots.start[0].props.gap')
  })

  it('refuses nesting deeper than six', () => {
    const recipe = goodRecipe()
    let node = recipe.tree as PrimitiveNode
    for (let i = 0; i < 6; i += 1) {
      const next: PrimitiveNode = { primitive: 'Stack', slots: { children: [] } }
      node.slots = { children: [next] }
      node = next
    }
    node.slots = { children: [{ primitive: 'Text', content: { field: 'body' } }] }
    expect(errors(recipe).map((issue) => issue.rule)).toContain('tree.depth')
  })
})

/*
Things that belong together sit closer than the things around them
(forumone-2026#847): a Stack inside a Stack spaces its children more tightly
than the one around it, or nothing in it reads as a group.
*/
describe('spacing rhythm', () => {
  /** The good recipe's stack spaced `outer`, its heading and text in a nested stack spaced `inner`. */
  function nested(outer: string, inner: string | undefined): Recipe {
    return variant((r) => {
      const stack = stackOf(r)
      stack.props = { gap: outer }
      const children = stack.slots!['children']!
      stack.slots!['children'] = [
        {
          primitive: 'Stack',
          ...(inner ? { props: { gap: inner } } : {}),
          slots: { children: [children[0]!, children[1]!] },
        },
        children[2]!,
      ]
    })
  }

  it('passes a group spaced more tightly than the gaps around it', () => {
    expect(errors(nested('spacing-8', 'spacing-2'))).toEqual([])
  })

  it.each([
    ['as wide', 'spacing-4', 'spacing-4'],
    ['wider', 'spacing-2', 'spacing-8'],
    ['as wide, by default', 'spacing-2', undefined],
  ])('refuses an inner group spaced %s', (_label, outer, inner) => {
    expect(errors(nested(outer, inner))).toEqual([
      expect.objectContaining({
        rule: 'spacing.rhythm',
        path: 'tree.slots.children[0].slots.start[0].slots.children[0].props.gap',
        message: expect.stringContaining(`smaller than ${outer}`),
      }),
    ])
  })
})

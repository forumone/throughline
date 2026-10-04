# Recipes

`@forumone/throughline-design-system/recipes`: composed sections stored as data rather than code.

A recipe is a section someone wanted that the design system doesn't have, built in minutes from what it does have, without a pull request. It has two parts:

- **A provisional `ComponentContract`**, using the same schema every real component's contract satisfies. Its `content.fields` are the section's editable fields.
- **A tree** made only of the manifest's **primitives** (layout and content building blocks; see [contract → primitives](contract.md#primitives)) and of existing **components** whose placement allows them inline.

```ts
{
  primitive: 'Section', props: { variant: 'dark' },
  slots: { children: [
    { primitive: 'Stack', props: { gap: 'spacing-4' }, slots: { children: [
      { primitive: 'Heading', props: { level: 2 }, content: { field: 'heading' } },
      { component: 'Button', fields: { label: { field: 'ctaLabel' }, href: { field: 'ctaHref' }, style: 'primary' } },
    ] } },
  ] },
}
```

Every word comes from a binding, `{ field: "<name>" }`. Every visual setting is a value its primitive declares. The shape is strict: a `className`, `style` or `html` key is refused rather than ignored.

## `lintRecipe(recipe, manifest)`

`lintRecipe` returns issues, each with the node's `path` in the tree, a `rule` and a message an agent can act on. An empty list means the recipe may be saved. Run it against the current manifest, not only when the recipe is saved: a token renamed since then shows up as an error.

| Rule | What it checks |
| --- | --- |
| `shape` | The structure, strictly |
| `contract.*` | The provisional contract passes `ComponentContractSchema`; its `intent` is at least 50 characters; it has at least one anti-example; its placement is `["section"]`; and its name isn't already a component or primitive |
| `tree.root`, `tree.depth`, `tree.size` | The root is a layout primitive; nesting is at most 6 deep; there are at most 60 nodes |
| `primitive.unknown`, `props.*` | The primitive exists, and every prop value is one the primitive offers (token, enum or boolean) |
| `slots.*` | Slots exist, required slots are filled, and `max` is respected. A content primitive holds no slots |
| `content.*` | A content primitive is bound to a field of the kind it shows |
| `images.alt` | An image field is required, so every image is chosen, with its alt text, from the media library |
| `headings.order` | No heading level is skipped. There is no h1, because Heading's levels are 2 to 4 |
| `component.*` | The component exists and is placed `inline`. Its fields are its own, of matching types, and every required one is bound (so a link has its label and destination). The only literals allowed are a boolean, or a `select` value that is one of the component's declared variants |
| `fields.*` | Every binding names a declared field, and every declared field is shown |

## `<RenderRecipe>`

```tsx
<RenderRecipe recipe={recipe} content={values}
  primitives={{ Section, Stack, Heading, Text, Image, … }}
  registry={blockRegistry} fields={contractFieldsByComponent} context={coerceContext} />
```

`RenderRecipe` is an interpreter. It looks each node up in what the host hands it and draws nothing for a node it can't resolve:

- **Text** fields become a content primitive's children.
- **Images** go through `context.resolveMedia` and arrive as `src` and `alt`.
- **Rich text** goes through `context.renderRichText`.
- **Component nodes** go through `coerceBlock` with the component's contract, exactly as its block would.

An empty field draws nothing, rather than an empty heading. The host lints before it renders.

# Design system contracts

A design system contract is a machine-readable description of your components: what they're for, what props they take, what slots they expose, what compositions are valid, and — crucially — what compositions are *not* valid. It's the difference between giving Claude a list of components ("Hero, Card, FAQ") and giving Claude a working knowledge of your design system.

## The problem the contract solves

Without a contract, Claude has to guess. Given "make a homepage hero," it produces something that looks plausible — maybe a Hero component with a 200-word body, three CTAs stacked vertically, a background video, and a subtitle. Some of these decisions are wrong for your DS. The component might support a body, but your DS's editorial guidance says heroes should never exceed 30 words. The Hero's `cta` slot might accept multiple CTAs technically, but your DS forbids stacking them — they're meant to live side-by-side.

Telling Claude "don't do that" once doesn't scale. The contract encodes those rules so every conversation starts from the same place.

## What's in a contract

Each component contract has:

| Field | What it expresses |
| --- | --- |
| `name`, `description` | Identity. Description is what Claude reads to decide if this is the right component. |
| `categories` | Tags for matching: `hero`, `media`, `social-proof`, `cta`. The Components MCP uses these for `propose_components` candidate filtering. |
| `intents` | Free-text phrases this component is good for: "introduce a topic with a hero image," "show three statistics with comparable scale." |
| `props` | Zod-compatible schema describing each prop, its type, defaults, validation rules. |
| `slots` | Named regions: `body`, `media`, `cta`. Each slot declares which components it can contain. |
| `examples` | Sample inputs Claude can learn from. Real examples beat synthetic ones. |
| `antiExamples` | Inputs that look right but are wrong, plus the reason why. |
| `tokens` | CSS custom properties / brand tokens the component reads. Helps Claude reason about theming. |
| `storyId` | The Storybook story ID. The lint pipeline cross-references the manifest with `storybook-static/index.json` so a contract pointing at a missing story fails CI. |

A real contract is 50–150 lines per component. The reference DS in `packages/reference-ds` is a good template.

## Anti-examples are the most-overlooked part

Most DS docs document what works. The contract also documents what *doesn't*, with the reason. For Claude, the anti-example is the more useful signal: it constrains the search space.

```typescript
antiExamples: [
  {
    description: "Hero with three CTAs",
    input: { headline: 'Welcome', ctas: [primary, secondary, tertiary] },
    reason:
      "Hero supports at most two CTAs. A third forces visual hierarchy collapse.",
  },
  {
    description: "Hero with a body longer than 30 words",
    input: { headline: 'Welcome', body: longText },
    reason:
      "Heroes should set a single thought, not deliver a paragraph. Use SectionIntro for prose.",
  },
],
```

Without these, Claude treats the prop schema as the entire constraint surface. With them, Claude has a working theory of editorial intent.

## The composition validator

The Components MCP server uses the contract to validate compositions, not just individual components. A "composition" is a tree: a Page, with a Hero in its `header` slot, a SectionIntro and CardGrid in its `body`, a CTASection in its `footer`. The validator walks the tree:

- Every component slot's contents are valid for that slot
- Every prop matches its schema
- No anti-pattern matches (these are checked structurally where possible, by description otherwise)
- Token usage stays within the declared `tokens` for each component

The validator runs on every `propose_components` call (so Claude gets validated suggestions) and on every `publish` call (stage 2 of the pipeline — see [The trust boundary](the-trust-boundary.md)).

## Brand tokens

Tokens are how a single contract powers many brand variants. Components declare which tokens they read; you supply the values. The reference DS uses neutral tokens (mostly grayscale + a single accent). A real client overrides:

```typescript
componentsPlugin({
  manifest: { type: 'object', manifest },
  brand: {
    tokens: {
      'color.brand.primary': '#0a4d8a',
      'color.brand.accent': '#ffba34',
      'font.heading': '"Söhne", system-ui, sans-serif',
      // ...
    },
  },
})
```

The contract doesn't change. The components don't change. The CSS variables resolve to brand-specific values at render time.

## Why every site needs one (eventually)

You can ship a Throughline project with no contract and use the reference DS verbatim. You'll outgrow that within the first sprint, because:

- Marketing wants components the reference DS doesn't have ("we need a Pricing block")
- Editorial wants existing components constrained differently ("Hero body cap is 20 words for us, not 30")
- Brand wants tokens swapped or extended

Once you're modifying components, you need a contract. The contract is what makes Claude useful with *your* DS rather than just generally useful.

## Where contracts live

- **Reference DS**: each component has a `<Component>.contract.ts` file in `packages/reference-ds/src/components/<component>/`. They're aggregated into a manifest by `scripts/build-manifest.ts` at build time.
- **Your DS**: same shape. The Components plugin reads the manifest from a URL or an imported object — you pick.

## Authoring guidance

See [Authoring component contracts](../guides/authoring-component-contracts.md) for the practical "how do I write a good contract?" guide.

## Why not just JSDoc

JSDoc + TypeScript types describe shape, not intent. They don't capture "this CTA slot should be used at most twice," "this color is wrong on this background," "this layout doesn't compose well with that one." Those are the rules a contract carries.

The contract is also discoverable at runtime: Claude calls `list_components` and gets contracts back, with all their structured information. It doesn't have to read your JSDoc — and JSDoc isn't structured anyway.

## Where to look in code

- `packages/design-contract/src/schemas.ts` — `ComponentContractSchema`, `ManifestSchema`
- `packages/design-contract/src/lint.ts` — `lintManifest`, the rules engine
- `packages/reference-ds/src/components/Hero/Hero.contract.ts` — a worked example
- `packages/components/src/composition/validator.ts` — what gets enforced at publish time

# The reference design system

A brand-neutral reference design system that demonstrates contract compliance for Throughline: twelve components, a CSS-variable token layer, a generated manifest, and Storybook.

**Private, and part of `@forumone/create-throughline`.** From 1.0 it is not published. It is two things:

- **The scaffold's design system.** `create-throughline` vendors its source into a new project's `design-system/` (`pnpm --filter @forumone/create-throughline sync-reference-ds`), and CI fails when the copy drifts. Change it here, then sync.
- **A test fixture.** `@forumone/throughline/components` runs its tests against this manifest, and CI builds this Storybook and validates the manifest against it.

Its last published version, `0.3.7`, stays on npm.

## The components

| Component      | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `Hero`         | Page opener with headline, body, CTAs, optional media — three variants |
| `SectionIntro` | h2-level section opener with optional eyebrow and body                 |
| `Prose`        | Typographic container for long-form rich-text content                  |
| `MediaBlock`   | Single image or video with optional caption and aspect ratios          |
| `Card`         | Linked or static content card with image, title, description, link     |
| `CardGrid`     | 2/3/4-column responsive layout for Cards                               |
| `CTASection`   | Page-bottom call to action with one or two buttons                     |
| `Stats`        | 2–4 headline metrics as a semantic `<dl>`                              |
| `FAQ`          | Disclosure-style Q&A using native `<details>`/`<summary>`              |
| `Quote`        | Pullquote or testimonial with optional attribution                     |
| `Divider`      | Decorative or semantic horizontal rule                                 |
| `Spacer`       | Explicit token-sized vertical spacing                                  |

Every component ships a `ComponentContract` that conforms to `@forumone/throughline-design-system/contract`. The aggregated manifest is at the `./manifest` subpath.

## Using components

Inside this repository; nothing outside it can install a private package. A scaffolded project imports the same components from its own `design-system/` package, under the name it chose.

```tsx
import '@forumone/throughline-reference-ds/styles.css'
import { Hero, CardGrid, Card } from '@forumone/throughline-reference-ds'

export function HomePage() {
  return (
    <>
      <Hero
        eyebrow="New program"
        headline="Fellowship for climate researchers"
        body="A one-year fellowship supporting researchers at the intersection of climate and community resilience."
        cta={{ label: 'Apply now', url: '/apply' }}
      />
      <CardGrid columns={3}>
        <Card title="Research" description="…" link={{ label: 'Read', url: '#' }} />
        <Card title="Partnerships" description="…" link={{ label: 'Read', url: '#' }} />
        <Card title="Funding" description="…" link={{ label: 'Read', url: '#' }} />
      </CardGrid>
    </>
  )
}
```

## Reading the manifest

The aggregated manifest ships at the `./manifest` subpath. Component servers, lint tooling, and documentation sites consume it:

```ts
import manifest from '@forumone/throughline-reference-ds/manifest'
import { loadManifest } from '@forumone/throughline-design-system/contract'

const loaded = loadManifest(manifest)
console.log(loaded.listComponents())
// ['Card', 'CardGrid', 'CTASection', 'Divider', 'FAQ', 'Hero', 'MediaBlock', 'Prose', 'Quote', 'SectionIntro', 'Spacer', 'Stats']
```

## Theming via CSS variables

Every token is exposed as a CSS variable on `:root`. Override them to rebrand without touching component code:

```css
:root {
  --color-brand-primary: #7e33ff;
  --color-brand-primary-hover: #6420cc;
  --font-family-sans: 'DM Sans', system-ui, sans-serif;
}
```

The package also ships a `prefers-color-scheme: dark` override that swaps background, text, and border tokens. Clients with more elaborate dark-mode requirements should override the entire token layer.

Full token list: `src/styles/tokens.css` (generated from `src/tokens/*.ts` via `pnpm build:tokens-css`).

## Storybook

```bash
pnpm --filter @forumone/throughline-reference-ds storybook      # dev server on :6006
pnpm --filter @forumone/throughline-reference-ds build-storybook # produces storybook-static/
```

The static build is used by `pnpm validate` to verify that every `storyId` declared on a contract resolves to a real Storybook story.

## CI validation

```bash
pnpm --filter @forumone/throughline-reference-ds build
pnpm --filter @forumone/throughline-reference-ds build-storybook
pnpm --filter @forumone/throughline-reference-ds validate
```

`validate` runs `lintManifest` from `@forumone/throughline-design-system/lint` against the generated manifest. Errors fail the build; warnings print but pass, except `antiExamples.empty` and `intent.brevity`, which `scripts/validate.ts` promotes to errors.

## Authoring your own design system

Use this package as a reference. Each component has a `.contract.ts` file; every contract satisfies `ComponentContractSchema`. Copy the structure, replace the content, and your design system becomes a valid input to Throughline.

The contract authoring guide is [Authoring component contracts](../../../docs/guides/authoring-component-contracts.md), and the schema is documented in [the contract reference](../../../docs/reference/design-system/contract.md).

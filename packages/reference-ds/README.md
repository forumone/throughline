# @forumone/throughline-reference-ds

A competent, brand-neutral reference design system that demonstrates contract compliance for Throughline. Twelve components, a CSS-variable token layer, a generated AI-ready manifest, and Storybook.

## What this package provides

Twelve components covering the common editorial surface:

| Component | Purpose |
| --- | --- |
| `Hero` | Page opener with headline, body, CTAs, optional media — three variants |
| `SectionIntro` | h2-level section opener with optional eyebrow and body |
| `Prose` | Typographic container for long-form rich-text content |
| `MediaBlock` | Single image or video with optional caption and aspect ratios |
| `Card` | Linked or static content card with image, title, description, link |
| `CardGrid` | 2/3/4-column responsive layout for Cards |
| `CTASection` | Page-bottom call to action with one or two buttons |
| `Stats` | 2–4 headline metrics as a semantic `<dl>` |
| `FAQ` | Disclosure-style Q&A using native `<details>`/`<summary>` |
| `Quote` | Pullquote or testimonial with optional attribution |
| `Divider` | Decorative or semantic horizontal rule |
| `Spacer` | Explicit token-sized vertical spacing |

Every component ships a `ComponentContract` that conforms to `@forumone/throughline-design-contract@^0.2.0`. The package exposes the aggregated manifest at the `./manifest` subpath so any MCP server or client app can read it directly.

## Three ways to use this package

**As a starting point.** Copy components into your own design system. Customize freely; keep what works.

**As a test fixture.** Core framework packages (Component Server, Publishing Server) consume this DS to verify their behaviour against a realistic, contract-compliant design system.

**As a demo.** Stand up a Throughline site in minutes using only these twelve components — useful for prototypes, internal tools, and pitches.

## Installation

```bash
pnpm add @forumone/throughline-reference-ds
```

Peers: `react` + `react-dom` 18 or 19.

## Using components

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
import { loadManifest } from '@forumone/throughline-design-contract'

const loaded = loadManifest(manifest)
console.log(loaded.listComponents())
// ['Card', 'CardGrid', 'CTASection', 'Divider', 'FAQ', 'Hero', 'MediaBlock', 'Prose', 'Quote', 'SectionIntro', 'Spacer', 'Stats']
```

## Theming via CSS variables

Every token is exposed as a CSS variable on `:root`. Override them to rebrand without touching component code:

```css
:root {
  --color-brand-primary: #7E33FF;
  --color-brand-primary-hover: #6420CC;
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

`validate` runs `lintManifest` from `@forumone/throughline-design-contract/lint` against the generated manifest. Errors fail the build; warnings print but pass.

## Authoring your own design system

Use this package as a reference. Each component has a `.contract.ts` file; every contract satisfies `ComponentContractSchema`. Copy the structure, replace the content, and your design system becomes a valid input to Throughline.

The authoring guide lives at `docs/building-plugins.md` (for MCP plugins) and the contract authoring expectations live in `@forumone/throughline-design-contract`'s README.

# @forumone/throughline-reference-ds

A brand-neutral, contract-compliant design system. Twelve components, CSS Modules, neutral tokens, and a generated manifest. Three roles:

1. **A working starter** — the CLI scaffolder wires it by default; out of the box you have a usable DS
2. **A reference for authoring contracts** — copy patterns from here when building your own DS
3. **A test fixture** — every Components plugin integration test runs against this manifest

## Install

```bash
pnpm add @forumone/throughline-reference-ds
```

Peer dependencies: `react@^18.0.0 || ^19.0.0`, `react-dom` matching.

## Components

| Name | Description |
| --- | --- |
| Hero | Page-opening section with headline, optional body, and 0–2 CTAs |
| SectionIntro | Mid-page transition with a title + lead paragraph |
| Prose | Free-form rich text region |
| MediaBlock | Image or video alongside descriptive copy |
| Card | Tile with image, title, body, and optional CTA |
| CardGrid | Layout container holding 2–4 Cards |
| CTASection | Standalone call-to-action band |
| Stats | 2–4 statistics in a horizontal row |
| FAQ | Q-and-A list with optional preface |
| Quote | Testimonial / pull quote with attribution |
| Divider | Horizontal rule with configurable spacing |
| Spacer | Vertical empty space |

Each lives in `src/components/<Name>/` with:

- `<Name>.tsx` — React component
- `<name>.module.css` — CSS Modules
- `<Name>.stories.tsx` — Storybook
- `<Name>.contract.ts` — the design contract for this component
- `<Name>.test.tsx` — unit tests

## Public API

```typescript
import {
  Hero,
  SectionIntro,
  Prose,
  MediaBlock,
  Card,
  CardGrid,
  CTASection,
  Stats,
  FAQ,
  Quote,
  Divider,
  Spacer,
} from '@forumone/throughline-reference-ds'

// Subpath: the manifest as a JSON import
import manifest from '@forumone/throughline-reference-ds/manifest' with { type: 'json' }

// Subpath: tokens as TS values
import { allTokens, colors, typography, spacing, radii } from '@forumone/throughline-reference-ds/tokens'

// Subpath: CSS — import once at the top of your app
import '@forumone/throughline-reference-ds/styles.css'
```

## Tokens

Tokens live in `src/tokens/` and compile to a CSS custom-properties block via `scripts/build-tokens-css.ts`:

| Group | Examples |
| --- | --- |
| Colors | `--color-bg`, `--color-text`, `--color-brand-primary`, `--color-surface`, ... |
| Typography | `--font-heading`, `--font-body`, `--text-base-size`, `--leading-body`, ... |
| Spacing | `--space-1` through `--space-16`, `--space-section` |
| Radii | `--radius-sm`, `--radius-md`, `--radius-lg` |

Override at the `:root` (or any container) level in your own CSS:

```css
:root {
  --color-brand-primary: #0a4d8a;
  --color-brand-accent: #ffba34;
  --font-heading: '"Söhne", system-ui, sans-serif';
}
```

The generated CSS includes a `prefers-color-scheme: dark` block with sensible defaults for dark mode.

## Manifest

`@forumone/throughline-reference-ds/manifest` is the generated JSON manifest, ready to pass to `componentsPlugin`:

```typescript
import { componentsPlugin } from '@forumone/throughline-components'
import manifest from '@forumone/throughline-reference-ds/manifest' with { type: 'json' }

componentsPlugin({
  manifest: { type: 'object', manifest },
  matching: { strategy: 'tfidf' },
}),
```

## Build pipeline

```bash
pnpm --filter @forumone/throughline-reference-ds build         # tsc -> dist/, build-tokens-css -> dist/styles/, build-manifest -> dist/manifest.json
pnpm --filter @forumone/throughline-reference-ds build-storybook   # storybook-static/
pnpm --filter @forumone/throughline-reference-ds validate      # lintManifest with storybook story IDs
pnpm --filter @forumone/throughline-reference-ds test          # vitest
pnpm --filter @forumone/throughline-reference-ds storybook     # local Storybook server
```

`validate` is the most important command. It runs `lintManifest` from `@forumone/throughline-design-contract` against the generated manifest and the Storybook index — a contract pointing at a missing story fails. CI runs this on every PR.

## Customizing the reference DS

Three approaches as your project diverges:

1. **Token overrides only** — the simplest. Override CSS variables in your own stylesheet; never touch the package.
2. **Wrapper layer** — your client repo's `packages/design-system/` re-exports `@forumone/throughline-reference-ds` with branded wrappers. The CLI scaffolder produces this layout when you choose "use reference DS."
3. **Hard fork** — vendor the source into your own package, modify freely, give up upstream upgrades. Only when you've outgrown the contract.

## Related

- Concept: [Design system contracts](../concepts/design-system-contracts.md)
- Guide: [Authoring component contracts](../guides/authoring-component-contracts.md)
- Reference: [@forumone/throughline-design-contract](design-contract.md), [@forumone/throughline-components](components.md)

# Design system

Your project's design system and its Storybook authoring environment. It started as a vendored copy of the Throughline reference DS — a working, brand-neutral set of 12 components with contracts — so you can edit it directly and make it your own.

```
src/
  tokens/        Design tokens (colors, typography, spacing, radii, layout) → CSS custom properties
  styles/        reset.css, generated tokens.css, base.css
  foundations/   Storybook "Foundations" pages (Colors, Typography, Spacing, Radii, Elevation, Layout & Containers)
  components/    One folder per component: .tsx, .module.css, .stories.tsx, .test.tsx, .contract.ts
scripts/         build-tokens-css, build-styles, build-manifest, validate
.storybook/      Storybook (react-vite) config
```

## Commands

```bash
pnpm --filter "./design-system" storybook         # author components at http://localhost:6006
pnpm --filter "./design-system" build             # tokens → tsc → styles → dist/manifest.json
pnpm --filter "./design-system" build-storybook   # static Storybook (produces storybook-static/index.json)
pnpm --filter "./design-system" validate          # lint contracts + cross-check every storyId against the built Storybook
pnpm --filter "./design-system" test              # component tests (vitest + testing-library)
```

The web app imports `./manifest` (the built `dist/manifest.json`) and feeds it to the Components MCP server. The root `pnpm dev` builds the design system first so the manifest exists.

## Branding

1. Edit `src/tokens/*` — components read tokens as CSS variables, so re-theming doesn't touch component code.
2. Edit or add components under `src/components/`. Keep each component's `.contract.ts` and `.stories.tsx` in sync; `storyId` must point at a real story (the `validate` script enforces this).
3. Update the **Foundations** pages in `src/foundations/` as your tokens change.

See the Throughline docs: `concepts/design-system-contracts.md` and `guides/authoring-component-contracts.md`.

# Design system

An empty Storybook authoring environment for your own design system. Bring your components here.

```
src/
  components/    One folder per component: .tsx, .module.css, .stories.tsx, .contract.ts
  foundations/   Storybook "Foundations" pages documenting your tokens
.storybook/      Storybook (react-vite) config
```

## Commands

```bash
pnpm --filter "./design-system" storybook         # author at http://localhost:6006
pnpm --filter "./design-system" build-storybook   # static Storybook
pnpm --filter "./design-system" typecheck
```

Point the Components MCP server at your manifest in `apps/web/src/payload.config.ts` (`componentsPlugin({ manifest })`) once you generate one. For a worked starting point, re-scaffold with the reference design system.

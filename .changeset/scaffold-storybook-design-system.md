---
"@forumone/create-throughline": minor
---

Scaffold a real Storybook authoring environment for the design system.

When you scaffold with the reference design system, the generator now creates a top-level `design-system/` workspace (a sibling of `apps/`, matching the Forum One `forumone.com-2026` layout) that vendors the reference DS's **editable source** — 12 components with `.stories.tsx`, `.contract.ts`, tokens, and a Storybook instance — instead of re-exporting the compiled npm package. New projects can run `pnpm storybook` immediately, author components, and `pnpm validate` to cross-check every contract `storyId` against the built Storybook.

Also:

- The web app now imports the workspace design system's built manifest (`<scope>/design-system/manifest`) instead of the npm reference-ds manifest, and the root `pnpm dev` builds the design system first so the manifest exists.
- Root scripts `storybook`, `build-storybook`, and `validate`; turbo tasks to match; `design-system` added to the workspace globs.
- Fix: template `.gitignore` files are now authored as `gitignore` and restored on output, so they survive npm publish (previously the generated project shipped without a root `.gitignore`).
- Fix: the generated web app now typechecks clean. Adds the `@payload-config` tsconfig path; corrects drifted plugin APIs in `route.ts` (`publishingApiKey`, `createPayloadReachableCheck()`) and `payload.config.ts` (`auditQueryPlugin({})`, `buildActionUrl` async `{ approvalId, action, approverId }`, manifest typed as `Manifest`).

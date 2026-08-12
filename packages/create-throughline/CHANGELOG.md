# @forumone/create-throughline

## 0.3.0

### Minor Changes

- e994176: Scaffold a real Storybook authoring environment for the design system.

  When you scaffold with the reference design system, the generator now creates a top-level `design-system/` workspace (a sibling of `apps/`, matching the Forum One `forumone.com-2026` layout) that vendors the reference DS's **editable source** — 12 components with `.stories.tsx`, `.contract.ts`, tokens, and a Storybook instance — instead of re-exporting the compiled npm package. New projects can run `pnpm storybook` immediately, author components, and `pnpm validate` to cross-check every contract `storyId` against the built Storybook.

  Also:
  - The web app now imports the workspace design system's built manifest (`<scope>/design-system/manifest`) instead of the npm reference-ds manifest, and the root `pnpm dev` builds the design system first so the manifest exists.
  - Root scripts `storybook`, `build-storybook`, and `validate`; turbo tasks to match; `design-system` added to the workspace globs.
  - Fix: template `.gitignore` files are now authored as `gitignore` and restored on output, so they survive npm publish (previously the generated project shipped without a root `.gitignore`).
  - Fix: the generated web app now typechecks clean. Adds the `@payload-config` tsconfig path; corrects drifted plugin APIs in `route.ts` (`publishingApiKey`, `createPayloadReachableCheck()`) and `payload.config.ts` (`auditQueryPlugin({})`, `buildActionUrl` async `{ approvalId, action, approverId }`, manifest typed as `Manifest`).

## 0.2.1

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

## 0.2.0

### Minor Changes

- 2dac330: Initial release of `@forumone/create-throughline`. Interactive CLI that scaffolds a new Throughline project: pnpm monorepo with Payload CMS + all eight Throughline plugins wired (audit, components, publishing, approvals, audit-query, integrations, email, forms), an Inngest endpoint registering every framework function, an `.env.example` listing every required secret, and an optional reference-design-system overlay. Run with `pnpm create @forumone/throughline my-project`.

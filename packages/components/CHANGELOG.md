# @forumone/throughline-components

## 0.2.4

### Patch Changes

- 7ee992d: Fix broken external installs of the core plugins.

  Every core plugin emits a runtime `import { getPluginRegistry } from '@forumone/throughline-plugin-contract'`, but `plugin-contract` was marked `private` and never published — so the published plugins pinned `@forumone/throughline-plugin-contract: 0.0.0`, a version that does not exist on npm, and any external `pnpm install` failed with a 404.

  `plugin-contract` is now published, so the dependent plugins re-pin a real version. The cross-plugin registry is keyed on a global `Symbol.for(...)` and stored on the Payload instance, so behavior is unchanged.

  Also fixes the scaffolder, which pinned `@forumone/throughline-reference-ds@^0.1.0` (latest is `0.2.0`) in the generated `apps/web` and `design-system` packages.

- Updated dependencies [7ee992d]
  - @forumone/throughline-plugin-contract@0.2.1
  - @forumone/throughline-core@0.2.2

## 0.2.3

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1

## 0.2.2

### Patch Changes

- [`123d2ea`](https://github.com/forumone/throughline/commit/123d2ea0172d9495b9e2c8e8c6039e623f5fba66) Thanks [@briangraves](https://github.com/briangraves)! - The plugin now attaches an in-process composition validator to the Payload instance under `Symbol.for('@forumone/throughline/components-validator')`. The publishing server's pipeline reads that symbol to validate compositions during the publish flow without round-tripping through the MCP transport. Adds the `'composition-validation'` capability to the plugin's registry entry.

## 0.2.1

### Patch Changes

- [`3ff1e9f`](https://github.com/forumone/throughline/commit/3ff1e9f43fad2e15fd42f67073227259ba7e78d4) Thanks [@briangraves](https://github.com/briangraves)! - Fix: drop the `/api` prefix from `componentsPlugin`'s default `routePrefix` so the endpoint registers at `/api/components/mcp` rather than `/api/api/components/mcp`. Payload mounts top-level endpoints under its API base (`config.routes.api`, default `/api`), which the previous default doubled. Consumers who pass an explicit `routePrefix` should also drop any leading `/api`.

## 0.2.0

### Minor Changes

- [#16](https://github.com/forumone/throughline/pull/16) [`4db5168`](https://github.com/forumone/throughline/commit/4db5168cfe83922ad371b7927029c21b009b1e53) Thanks [@briangraves](https://github.com/briangraves)! - Initial release. MCP server that exposes a design system manifest as seven conversational tools: `list_components`, `get_contract`, `get_variants`, `get_tokens`, `suggest_for_intent`, `validate_composition`, `find_anti_pattern`. Ships TF-IDF intent matching (no external deps); embeddings strategy reserved for a follow-up release. Accepts manifests as imported objects, remote URLs (with `refreshInterval`), or Payload collections.

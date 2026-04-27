# @forumone/throughline-components

## 0.2.2

### Patch Changes

- [`123d2ea`](https://github.com/forumone/throughline/commit/123d2ea0172d9495b9e2c8e8c6039e623f5fba66) Thanks [@briangraves](https://github.com/briangraves)! - The plugin now attaches an in-process composition validator to the Payload instance under `Symbol.for('@forumone/throughline/components-validator')`. The publishing server's pipeline reads that symbol to validate compositions during the publish flow without round-tripping through the MCP transport. Adds the `'composition-validation'` capability to the plugin's registry entry.

## 0.2.1

### Patch Changes

- [`3ff1e9f`](https://github.com/forumone/throughline/commit/3ff1e9f43fad2e15fd42f67073227259ba7e78d4) Thanks [@briangraves](https://github.com/briangraves)! - Fix: drop the `/api` prefix from `componentsPlugin`'s default `routePrefix` so the endpoint registers at `/api/components/mcp` rather than `/api/api/components/mcp`. Payload mounts top-level endpoints under its API base (`config.routes.api`, default `/api`), which the previous default doubled. Consumers who pass an explicit `routePrefix` should also drop any leading `/api`.

## 0.2.0

### Minor Changes

- [#16](https://github.com/forumone/throughline/pull/16) [`4db5168`](https://github.com/forumone/throughline/commit/4db5168cfe83922ad371b7927029c21b009b1e53) Thanks [@briangraves](https://github.com/briangraves)! - Initial release. MCP server that exposes a design system manifest as seven conversational tools: `list_components`, `get_contract`, `get_variants`, `get_tokens`, `suggest_for_intent`, `validate_composition`, `find_anti_pattern`. Ships TF-IDF intent matching (no external deps); embeddings strategy reserved for a follow-up release. Accepts manifests as imported objects, remote URLs (with `refreshInterval`), or Payload collections.

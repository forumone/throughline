# @forumone/throughline-components

## 0.2.0

### Minor Changes

- [#16](https://github.com/forumone/throughline/pull/16) [`4db5168`](https://github.com/forumone/throughline/commit/4db5168cfe83922ad371b7927029c21b009b1e53) Thanks [@briangraves](https://github.com/briangraves)! - Initial release. MCP server that exposes a design system manifest as seven conversational tools: `list_components`, `get_contract`, `get_variants`, `get_tokens`, `suggest_for_intent`, `validate_composition`, `find_anti_pattern`. Ships TF-IDF intent matching (no external deps); embeddings strategy reserved for a follow-up release. Accepts manifests as imported objects, remote URLs (with `refreshInterval`), or Payload collections.

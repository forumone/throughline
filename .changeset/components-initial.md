---
'@forumone/throughline-components': minor
---

Initial release. MCP server that exposes a design system manifest as seven conversational tools: `list_components`, `get_contract`, `get_variants`, `get_tokens`, `suggest_for_intent`, `validate_composition`, `find_anti_pattern`. Ships TF-IDF intent matching (no external deps); embeddings strategy reserved for a follow-up release. Accepts manifests as imported objects, remote URLs (with `refreshInterval`), or Payload collections.

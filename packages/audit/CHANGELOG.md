# @forumone/throughline-audit

## 0.2.1

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1

## 0.2.0

### Minor Changes

- 68cad81: Initial release of the audit query server. Five read-only MCP tools surface the audit log written by `@forumone/throughline-core`'s `auditPlugin`: `query_audit` (general filter), `get_change_history` (single-document history), `who_changed_what` (user activity, defaults to the caller), `what_changed_in_range` (grouped time-bounded summary), `get_recent_failures` (recent `success=false` events). Output is formatted for conversational use — relative times, named actors, prose summaries. Admin / editor gate by default, with `who_changed_what` always allowing self-lookup.

---
'@forumone/throughline-audit': minor
---

Initial release of the audit query server. Five read-only MCP tools surface the audit log written by `@forumone/throughline-core`'s `auditPlugin`: `query_audit` (general filter), `get_change_history` (single-document history), `who_changed_what` (user activity, defaults to the caller), `what_changed_in_range` (grouped time-bounded summary), `get_recent_failures` (recent `success=false` events). Output is formatted for conversational use — relative times, named actors, prose summaries. Admin / editor gate by default, with `who_changed_what` always allowing self-lookup.

---
'@forumone/throughline': minor
---

Every tool the suite serves records a `system.error` when it throws. Editorial (`find_content_needing_attention`, `get_content_calendar`, `list_my_work`, `search_content`), references (`find_references`, `can_delete`), `check_slug` and `list_job_failures` were added to the MCP collector without an audit writer, so a crash in them reached the log and nowhere else. They now record one, under four new `mcp_server` values: `editorial`, `references`, `fields`, `observability`.

**Upgrading: a migration.** The audit collection's `mcpServer` select gains four options, which on Postgres is four values on `enum_audit_events_mcp_server`. Run `migrate:create` (with `BLOB_READ_WRITE_TOKEN` set if you use the storage plugin) and apply it before deploying; nothing else changes. A plugin registered by hand without `auditPlugin` still works, and only logs a crash.

---
'@forumone/throughline': minor
---

Adds `@forumone/throughline/content` and a `content:` option on `throughline()`, with the MCP tools an agent uses to read before it writes a draft: `describe_content_type`, `find_documents`, `find_related` and `get_document`. Each call runs as the person behind the API key. Field types, limits and a blocks field's allowed blocks come from the live config. Draft-writing tools follow in a later release.

**Upgrading: a migration.** The audit log's `mcpServer` gains `content`, a new value on `enum_audit_events_mcp_server`. A site that turns the tools on also gets four new checkbox columns on `payload-mcp-api-keys`. Run `migrate:create` and apply it before deploying.

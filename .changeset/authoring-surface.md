---
'@forumone/throughline': major
---

**`/api/mcp` serves eight authoring tools instead of every module's tools.** (throughline#302, forumone-2026#830)

A full install used to serve 48 tools, about 9k tokens. That's more than a model chooses between well, and more than some clients allow: Cursor stops at 40. The server is now shaped by what it's for, which is drafting and publishing content from a client such as Claude Desktop:

- `find`, `get`, `save_draft`, `edit_blocks`, `check`, `publish`, `design_guide` and `compose_section`.
- Each is a thin wrapper. The modules still build their own tools, into a collector `plugin-mcp` never sees, and the eight call those tools' handlers with the caller's context. Access, audit and every check are unchanged.
- **`publish` takes an `action`:** `now`, `schedule`, `unpublish`, `rollback` or `request_approval`.
  - Taking something live needs an admin or an editor. Set `mcp.canPublish` to use a different rule.
  - A document that needs approval cannot go live until approval is granted. `now` says so, names the approver groups, and files the request itself when given `approval`.
- **`edit_blocks` applies a list of block operations** (insert, update, move, remove) to one field, and checks and saves them together.
- **The operations tools stay, under their own names, for admins only.** These are the audit queries, integrations, job failures, the approvals queue, the calendar, health and the reference checks. `mcp: { ops: false }` turns them off.
- **`suite.mcpPrompts` adds three MCP prompts:** `draft_post`, `build_landing_page` and `get_ready_to_publish`. Pass them to `mcpPlugin({ mcp: { tools: suite.mcpTools, prompts: suite.mcpPrompts } })`.

**Breaking:** the module tools are no longer served by name. The host needs:

- a migration, because `plugin-mcp` drops the old per-tool checkbox columns on `payload-mcp-api-keys` and adds the new ones;
- every key set up again;
- its key defaults updated to the new tool names.

Runtime messages now name the new tools: `get`, `check` and `publish`. The module tool factories are still exported.

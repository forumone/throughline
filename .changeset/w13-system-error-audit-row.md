---
'@forumone/throughline-core': minor
'@forumone/throughline-approvals': patch
'@forumone/throughline-audit': patch
'@forumone/throughline-components': patch
'@forumone/throughline-forms': patch
'@forumone/throughline-integrations': patch
'@forumone/throughline-publishing': patch
---

`system.error` now has a writer. Every MCP tool handler the suite serves is
wrapped, so a tool that throws records one `system.error` audit row — the
server, the tool, the caller, the caller's `_meta`, and the error's message —
before the throw propagates to the MCP client as it did before.

The row carries no stack and no arguments: `error_message` is readable by every
admin and editor, a stack names file paths, and a tool's input can hold a draft
body or a form submission. A failure inside the recording is logged and
swallowed, so this wrapper can never replace a tool's real error with its own.

`mcpServer` is resolved through a map rather than from the collector's own
server name, because the two vocabularies disagree: the components server
declares itself `components` and the audit enum's value is `component`. A
server that passes an audit writer and has no name in that map is now a
boot-time refusal instead of a row Payload silently rejects. New export:
`auditServerFor`.

Each of the six servers passes its audit writer to `collector.add`, alongside
the logger it already passed. A host wiring a tool by hand passes none and gets
the previous behaviour.

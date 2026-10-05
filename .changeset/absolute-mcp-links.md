---
'@forumone/throughline': patch
---

The `previewUrl` and `adminUrl` that MCP tools return are absolute, so a person can open them from a chat in another app (forumone-2026#840). They were paths whenever the site left Payload's `serverURL` unset. They are now made absolute against `serverURL` when it is set, and otherwise against the origin the MCP request arrived at. A document's own fields are left as they are.

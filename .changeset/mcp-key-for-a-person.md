---
'@forumone/throughline': minor
---

`mcpApiKeyAccess` takes an optional `holder` rule. Given one, an admin can choose who a new MCP key belongs to; nobody can change it afterwards; and a key for someone the rule refuses is not saved, with the rule's reason. Without it, nothing changes: a key belongs to whoever created it.

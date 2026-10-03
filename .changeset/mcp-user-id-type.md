---
'@forumone/throughline': patch
---

`request_approval` and `respond_to_approval` work on Postgres. An MCP caller's id arrives as a string, and they wrote it as one into `requestedBy` and `decidedBy`, relationships to a users collection whose ids are serial numbers there — so Payload refused it ("The following field is invalid: Requested By") and no approval could be requested over MCP. They now write the id in the users collection's own id type (`customIDType`, or the adapter's default), and `list_my_requests` queries by it.

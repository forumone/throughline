---
'@forumone/throughline': patch
---

`rollback` restores the version as a draft, as its description promises. Before, rolling back wrote the version's own `_status` without saying it came from the publishing server, so on a site that blocks direct status writes every rollback was refused.

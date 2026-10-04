---
'@forumone/throughline': patch
---

`rollback` restores the version as a draft, as its description promises. Before, rolling back to a version that had been published wrote `_status: 'published'`, which skipped the pipeline. On a site that blocks direct status writes, every such rollback was refused instead.

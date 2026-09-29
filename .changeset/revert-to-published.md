---
'@forumone/throughline-publishing': patch
---

"Revert to published" works on a governed collection.

Payload's revert reads the live document and writes it back with no draft
flag, which the trust boundary read as promoting the pending draft and
refused with "Direct writes to `_status` are not allowed". A non-draft
`published` write over a pending draft is now allowed when its content is
exactly what is already live — it discards the draft and changes nothing a
reader sees. Any difference in content still has to go through the pipeline.

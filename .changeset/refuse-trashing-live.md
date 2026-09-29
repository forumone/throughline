---
'@forumone/throughline-publishing': patch
---

A published document cannot be moved to the trash.

On a collection with `trash: true`, trashing is an update that sets
`deletedAt`, and every read then leaves the document out, so trashing a live
page takes it off the site. `_status` stays `published` through that write, so
the trust boundary read it as an ordinary edit and let the page come down with
no policy check and no `unpublished` event. It is now refused with "Unpublish
it first, then move it to the trash."

Restoring from the trash works as a draft. The guard's live-status lookup now
reads with `trash: true`; without it the trashed row was invisible, the lookup
failed, and "Restore as draft" was refused. "Restore as published" is still a
publish, and still has to go through the pipeline.

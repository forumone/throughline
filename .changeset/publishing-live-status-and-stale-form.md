---
'@forumone/throughline-publishing': patch
---

Fix two defects reported against 0.3.2.

**A direct unpublish was allowed once a draft version existed.** `beforeChange` compared `data._status` against `originalDoc._status` and treated a match as a harmless no-op — but `originalDoc` is the *latest version*, not the live document. After any draft save of a published page, `originalDoc._status` is `'draft'` while the page is still live, so an unpublish matched the no-op branch and went through with no pipeline, no audit event and no revalidation. The hook now asks whether the write changes what the public sees, reading the live row when `originalDoc` cannot answer. Promoting a pending draft with a direct `_status: 'published'` write is blocked too — the live status never changes there, so no status comparison could have caught it. Ordinary edits of published documents are unaffected.

**The publish button left the form showing pre-edit content.** After publishing, the button reset the form from `useDocumentInfo().data` — the document as it was when the edit view mounted — which replaced the editor's just-saved values with the pre-edit ones and read as though the publish had discarded them. The draft save already merges the server's response into form state, so the reset is removed rather than replaced.

Also adds an integration suite that exercises the hooks inside a real Payload instance against a real database, covering the full matrix of draft saves, edits, publishes and unpublishes. Every defect in this hook so far came from unit tests encoding assumptions Payload does not hold.

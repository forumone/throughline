---
'@forumone/throughline-core': minor
'@forumone/throughline-approvals': minor
'@forumone/throughline-publishing': minor
---

Bind an approval to the document's content rather than to its `updatedAt`.

`request_approval` stored `String(document['updatedAt'] ?? …)` as `targetVersion`,
and publishing's approval step recomputed the same expression at publish time. So
an approval was tied to a timestamp that moves on **every** save. An editor fixing
a typo between an approver opening the request and clicking approve invalidated the
approval — and the approver spent that time reading a version that no longer
existed.

Requiring re-approval after an edit is a defensible rule. Inheriting it from
whichever timestamp field happened to be nearby is not, and it is why **autosave
could not be turned on** anywhere the approvals plugin is installed: autosave moves
`updatedAt` every couple of seconds of typing, so a pending approval would be
invalidated continuously.

Both sides now call `documentContentHash(document)`, new in
`@forumone/throughline-core`. It hashes the document with the metadata that moves
without the content moving stripped at every level — `id`, `createdAt`,
`updatedAt`, `_status`, `__v`, `_id`, `globalType` — over keys in sorted order,
since blocks come back out of JSONB in no promised order. Array order is preserved,
because that is the order of the blocks on the page. `{ exclude }` adds
app-specific bookkeeping fields to the strip list.

The rule is now the one that was wanted all along: a save that changed nothing
keeps a granted approval, a save that changed something invalidates it, and an edit
that is reverted brings the approval back. That last one is why this is a content
hash rather than a version id — a version id moves whether or not the content did.

The two sides only agree because they load the document identically, with
`payload.findByID({ collection, id, draft: true })` at the config's default depth.
A populated relationship and a bare relationship id are different values and no
normalising makes them one, so a caller hashing a document fetched at some other
depth gets a hash that matches nothing. That is stated on the function.

**Approvals pending at upgrade must be re-requested.** Their `targetVersion` holds
an ISO timestamp; the publish step now computes a hash, so nothing matches and
those documents report `approval-required` until a fresh request is granted. No
migration is offered, because the old value cannot be converted — the content it
was granted against is not recoverable from a timestamp. Grant a moment for
in-flight requests to clear before upgrading, or expect approvers to be asked once
more.

Also exports `isDraftWrite` from `@forumone/throughline-publishing`. It is the
predicate the plugin's own trust boundary uses to tell a "Save draft" apart from
an unpublish, and it is unavailable to host code that needs the same answer: an
`afterChange` hook cannot work it out, because Payload sets `data._status =
'draft'` on any `draft: true` update before the hooks run and `previousDoc` is the
latest _version_ rather than the live document. With autosave on, a host hook that
drops a cache or sends a notification fires every few seconds of typing unless it
asks this first.

Minor rather than patch on all three: `documentContentHash` and `isDraftWrite` are
new public API, and the stored meaning of `targetVersion` changes.

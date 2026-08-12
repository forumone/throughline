---
'@forumone/throughline-publishing': patch
---

Fix published documents being uneditable: allow draft writes through the trust boundary.

Editing an already-published document failed with `Direct writes to _status are not allowed` — from both the plugin's own Publish button and Payload's native Save Draft, which discarded the editor's work. Only first publishes worked, because an unmodified document skips the draft save.

Payload sets `data._status = 'draft'` on every `draft: true` update *before* `beforeChange` runs, whether or not the caller supplied it. By the time the hook saw the write, saving a draft of a published document was indistinguishable from unpublishing it: `data._status` was `'draft'` and `originalDoc._status` was `'published'` in both cases. A draft save writes a version and leaves the live document alone, so it should never have been blocked.

The plugin now installs a `beforeOperation` hook that records the operation's own `draft` argument, which `beforeChange` reads to tell the two apart. That argument is visible identically on the Local API, REST and GraphQL, unlike `req.query.draft`, which is only populated on the REST path.

A `draft: true` request that sets `_status: 'published'` is still blocked — Payload's own `isSavingDraft` excludes it, so it is a real publish and belongs in the pipeline. Genuine unpublishes and direct publishes are unchanged. Installing the status-write hook without the recorder fails closed.

---
'@forumone/throughline': major
---

The trust boundary now covers every write that changes what the public sees. A create with `_status: 'published'` is refused (create a draft, then publish), and so is a non-draft save that changes a live document (save a draft, then publish). Before, both went live with no pipeline, approval or audit row, so "requires approval" held only for a page's first publish. Data a system derives from a live page and writes back to it, such as an audio URL, passes with `context: DERIVED_WRITE_CONTEXT` from `/publishing`, which can never change `_status`, create, or promote a draft.

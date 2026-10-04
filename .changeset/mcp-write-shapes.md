---
'@forumone/throughline': minor
---

Content written over MCP can no longer be lost silently, and an empty block no longer publishes. (forumone-2026#832, found by the #830 eval)

- **Values are checked for their shape at every depth.** A link sent as a string, `"/contact"`, used to be saved as an empty `{ mode: "internal" }` and the write reported success. Now `save_draft` and `edit_blocks` refuse a value in the wrong shape and say which shape the field takes. That applies to a group or link, an array, a blocks field, a row and a block.
- **Rich text below the top level is converted or refused.** Markdown in an accordion item used to be stored as an object that renders nothing. The new `content.blockRichText` option converts it; without that option, only an editor state is accepted.
- **`get` and `design_guide` say how values are written.** Both return `valueShapes`, and each link field `get` describes carries its `shape`.
- **An empty block does not publish.** The composition step adds an `empty-block` rule: a block whose content fields are all empty. It doesn't apply to blocks with no content fields or blocks that fetch their own data.
- **A pending approval is reported.** `check` and `publish` name the approval request that's already pending, and `publish` won't file a second one.
- **`hasUnpublishedChanges` compares content, not timestamps.** A draft identical to what's live, for example after a rollback, no longer reports unpublished changes.
- **`request_approval` uses the collection's own preview link** when the collection has one, the same link every other tool returns.

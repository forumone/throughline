---
'@forumone/throughline-core': minor
---

Adds reference tracking, moved from forumone-2026: what uses a document, a refusal to delete or trash it while anything does, a "Used on" panel, and the `find_references` and `can_delete` MCP tools. Additive.

It works with blocks stored as JSON, which Payload cannot query. An upload inside a block has no foreign key, so deleting the image succeeded and it vanished from every page that showed it. The scan walks each collection's field config alongside its data, so it needs no list of field names, and reads both the published and draft state of every document.

- `referencesPlugin({ collections, mcpTools })` guards each listed collection. It puts a `beforeDelete` refusal and a `beforeChange` trash refusal first in each hook list, and by default adds the panel as the first sidebar field. The refusal names the documents, says which use it inside a block, and fails closed: a scan that throws refuses rather than allows.
- `findReferences`, `findReferencedIds`, `referencesIn` and the guard factories are exported for hosts that want them alone, from the root and from `@forumone/throughline-core/references`.
- The panel is a server component at `@forumone/throughline-core/rsc#UsedOnPanel`, so a consumer that never renders the admin never loads React. React is an optional peer.
- Blocks resolve from each `blocks` field, its `blockReferences` and the config's `blocks` registry, so no block list needs passing. Rich text is covered: `upload` and `relationship` nodes, and `block` and `inlineBlock` nodes walked as the block they name. forumone-2026's version missed blocks inside rich text.
- The target's own collection is scanned too, skipping the document itself, so a taxonomy term's children are found without a second query.

The two tools add two checkboxes to `payload-mcp-api-keys`, so a site that passes `mcpTools` needs a migration.

---
'@forumone/throughline': minor
---

Adds `insert_block`, `update_block`, `move_block` and `remove_block` to the content tools. They change one block of a draft's blocks field, either `layout` or a field inside a group such as a case study's `approach.blocks`, without resending the layout. A new or changed block is checked against the blocks the field offers and against its own field validation, which a draft save would otherwise skip. The field is then checked against the composition rules before saving, with the same lock check and audit record as `update_draft`.

**Upgrading: a migration.** The key collection gains four checkbox columns. Run `migrate:create` and apply it before deploying.

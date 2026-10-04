---
'@forumone/throughline': minor
---

Adds the recipe MCP tools to the components plugin (`get_recipe_vocabulary`, `validate_recipe`, and `save_recipe`, which writes drafts only), turned on with the new `throughline({ recipes: { blockType, collection } })`. The same setting configures the publish gate and lets `validate_composition` and the content write tools treat that block as a composed section instead of an unknown component.

**Upgrading: a migration.** The key collection gains three checkbox columns. Run `migrate:create` and apply it before deploying.

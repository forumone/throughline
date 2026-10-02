---
'@forumone/throughline-core': minor
---

Adds the field kit, moved from forumone-2026, at `@forumone/throughline-core/fields`, and the `check_slug` MCP tool. Additive.

- `slugField`, `slugify`, and `refuseSlugHeldInTrash`. The slug follows the title until set, is normalised whenever it is set, and is never re-derived. The trash guard names the trashed document that holds a slug before the unique index refuses it with a bare error.
- `publishedAtField` and `publishingFields`. The date is stamped on first publish, and kept when an open editor sends it back empty. `scheduledPublishField` is the field `publishingPlugin` schedules by.
- `revisedAtField` and `contentRevisedAt`. They record when a person's change to a published document went public, not when the row last changed.
- `unlistedField` and `LISTED`: live at its URL, absent from automatic lists.
- `usedBy`: a signed-in-only join field for "where is this used?".
- `mapFields`.
- `characterCountPlugin`. Every capped text field gets a counter and a cap it can't be typed past. Its controls are at `@forumone/throughline-core/client`, and `@payloadcms/ui` is a new optional peer. Register it after every plugin that adds fields.
- `fieldsPlugin({ mcpTools })` binds `check_slug`. The tool normalises a slug, says whether it's free in a collection (the trash included) and who holds it, and suggests the first free alternative.

Every field keeps the name, type and index it had in forumone-2026, so adopting it changes no schema. The tool adds a checkbox to `payload-mcp-api-keys`, so a site that passes `mcpTools` needs a migration.

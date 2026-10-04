---
'@forumone/throughline': minor
---

Lets the content tools write a rich-text field as `{ markdown }` or `{ html }`. Each collection's `richText` option maps a field to a site converter, which returns an editor state or refuses with what would be lost, and nothing is saved on a refusal. `describe_content_type` says what each rich-text field accepts. A field without a converter still takes only an editor state. No migration.

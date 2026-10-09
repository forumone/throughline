---
'@forumone/throughline-design-system': minor
---

A field override can name the editor a generated `richtext` field uses: `{ fields: { body: { editor } } }`. Without one the field takes the Payload config's default editor, as before. A host that keeps its default editor plain can now give one block's rich text a richer editor, such as `ArticleBody.body` with image alignment and pull quotes (forumone-2026#813). An `editor` set on a field that is not rich text throws at generation rather than being ignored.

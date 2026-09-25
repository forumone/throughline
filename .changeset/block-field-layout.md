---
'@forumone/throughline-design-contract': minor
'@forumone/throughline-design-system-payload': minor
---

Generated blocks are arranged for an author to read, not in the shape the
component's props happen to take.

- Every generated field has an explicit, sentence-case label. Payload's own
  fallback title-cased the prop name, so authors were asked for a "Cta Href"
  and an "Image Alt". Now they see "Call to action", "Alt text", "Open on page
  load", and a link's own controls read "Links to", "Page" and "URL".
- A `<prefix>Label` text field and its `<prefix>Href` or `<prefix>Url` link
  are drawn as one group headed by what they are together ("Call to action",
  "View all link"), with a matching `<prefix>Icon` inside it. This applies at
  every level, array rows included.
- Top-level selects, checkboxes and numbers, plus any field a contract marks
  with the new `advanced: true`, move to one collapsed "More options" section
  at the end of the block. A required field is never tucked away.

All of this is presentational. An unnamed group and a collapsible store their
children flat, so the stored data, the generated types and `coerce` are
unchanged. A host test that walks `block.fields` for named fields now has to
look through those wrappers.

`advanced` is a new optional contract field property. It hints that most
authors, and most compositions, should leave the field empty. It is refused on
a required field.

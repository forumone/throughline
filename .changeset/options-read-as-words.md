---
'@forumone/throughline-design-system-payload': minor
---

A generated select's options, and the picker's names, read as words.

- Every select option carries a label: `h2` is "Heading 2", `p` is
  "Paragraph", `bar-chart` is "Bar chart", `Linkedin` is "LinkedIn". A host
  passes `optionLabels` for values whose meaning is particular to its design
  system (`{ 'text-image': 'Text and image' }`). Stored values are unchanged.
- A select's description drops the sentences that only listed its options —
  "h2 | h3 | h4. Defaults to h3." — and keeps the advice after them. Because a
  generated select has no default of its own, a dropped sentence that named
  the component's default becomes "Leave empty for Heading 3." The contracts
  are untouched; the MCP server still hands the full prose to a composing
  model.
- A picker shelf spells its acronym: "CTA", not "Cta".
- `ComponentOverride.label` names a block whose component name splits badly
  (`AtAGlance` → "At AGlance"). The slug is unchanged.
- A block preview's alt text is "A preview of the High Impact CTA block"
  unless the host supplies one; `resolvePreview`'s `alt` is now optional.

---
'@forumone/throughline-design-system-payload': minor
---

A collapsed block says what it holds, not only what type it is.

Payload's block header is a number, a pill naming the block type, and the
optional block name, which nobody types — so a page opened as "01 Collage Hero
Untitled, 02 Logos Untitled, 03 Statement Section Untitled…". A generated
block's header now follows the pill with the block's `heading` or `title` as
it is being typed, or its first short text field when it has neither ("About
Forum One", a testimonial's quote). A block with no text of its own still reads
"Untitled", and a block name somebody did type still wins and is still
editable.

A name can no longer be added to a block that has none: shown as the input's
placeholder, the summary made the input cover the header, so a click meant to
open the block started editing a name instead.

Drawing only: stored data and generated types are unchanged. The header is a
client component at `@forumone/throughline-design-system-payload/client#BlockSummary`,
so a host regenerates its import map.

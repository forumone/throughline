---
'@forumone/throughline-design-system-payload': minor
---

An opened block says what it is for.

Every contract's `intent` starts with a sentence written for an author — "Use
once per page as the strongest possible prompt, normally just above the
footer." — and none of it reached the admin, where the picker shows a
thumbnail and a name. A generated block now opens with that first sentence,
with any component it names written the way the picker labels it ("Image
Hero", not `ImageHero`).

It is a `ui` field (`blockGuidance`), so it stores nothing and generated types
are unchanged. The line is drawn by
`@forumone/throughline-design-system-payload/client#BlockGuidance`, so a host
regenerates its import map. A contract with no `intent` gets no line.

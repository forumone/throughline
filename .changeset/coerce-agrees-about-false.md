---
'@forumone/throughline-design-system-payload': patch
---

An untouched optional group stops reaching its component as a truthy object

`generate/fields.ts` and `render/coerce.ts` each answer "has anybody filled this
in?" — one to decide whether a group may be saved, the other to decide whether
it reaches a component — and `coerce.ts` says in its own comment that the two
have to agree. They did not agree about `false`.

The generator treats an unticked checkbox as untouched, and has to: Payload
stores a checkbox's default and an author's deliberate untick identically, so
reading `false` as "somebody was here" made `ManagedForm` impossible to add to a
page — "Consent is invalid" on a block the editor had not touched
(forumone/forumone-2026#354). Coercion had no such branch, so the same group
that validated as empty was then handed to the component as
`{ required: false, text: '' }`.

That is the exact shape the note in the `group` branch exists to prevent: a
truthy object of empty values, which a component guarding with
`{group && <Card … />}` renders as a card with no title — an empty `<h3>` in the
page, an axe violation, and a heading a screen reader announces as nothing.
`ManagedForm.consent` is a live instance of the shape, and it is the only one in
the reference contracts today; any optional group with a boolean child has it.

`isEmptyValue` now treats `false` as empty, which is what `isEmpty` next door has
always done. The two functions are the same rule again.

Both files now have tests. `design-system-payload` had none at all — 1,321 lines
including the whole field generator — and four of its defects had been found
downstream in the host repository instead: every generated boolean default
inverted, `allOrNothing` misreading an unticked checkbox
(forumone/forumone-2026#354), `required` dropped for link fields
(forumone/forumone-2026#483), and fields lost in coercion
(forumone/forumone-2026#357). Those downstream suites assert the generated
blocks and are the right invariant; they simply cannot say what the generator
does with a contract shape no component in that repository happens to use.

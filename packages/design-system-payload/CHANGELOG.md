# @forumone/throughline-design-system-payload

## 0.4.2

### Patch Changes

- 1e0837c: An untouched optional group stops reaching its component as a truthy object

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

## 0.4.1

### Patch Changes

- Updated dependencies [957403b]
  - @forumone/throughline-design-contract@0.5.1

## 0.4.0

### Minor Changes

- 45724ee: A contract can say a boolean starts ticked, and be believed

  `boolean` fields were generated as `{ type: 'checkbox', defaultValue: false }`,
  with the `false` hardcoded. That made a component's own default unreachable from
  the CMS. A checkbox is stored ticked or unticked and never absent, so `coerce`
  always had a value to turn into a real boolean, the prop was never `undefined`,
  and a signature default like `hasFacade = true` could not apply. Every boolean a
  contract described arrived at its component as `false`, whatever the component
  said.

  It was not theoretical. `VideoEmbed.hasFacade` exists to keep a provider's
  iframe — several hundred kilobytes and its third-party cookies — off the page
  until a reader presses play, and its contract says "Leave on". Every embed an
  author added shipped with it off: the YouTube iframe was in the server HTML from
  first paint, setting cookies on readers who never pressed play, on a site whose
  stated rule is that no third-party tracking runs before consent.

  So `ContentField` gains an optional `defaultValue`, read by the checkbox branch
  and rejected on any other field type — anywhere else it is a value the author
  expects to take effect and nothing ever would.

  `allOrNothing` had to learn about it too. That rule treats `false` as "nobody
  touched this", which is right for a checkbox that starts unticked and exactly
  wrong for one that starts ticked: left alone, a group holding a ticked-by-default
  boolean would never look empty, and the rule would demand the group's required
  children of an author who had typed nothing. It now takes a field's declared
  default into account rather than the value alone.

  **Existing stored values are untouched.** `defaultValue` applies to a field an
  author has not yet filled in, so blocks already saved keep whatever is in the
  database; a `VideoEmbed` saved before this change still renders without its
  facade until someone edits it.

### Patch Changes

- Updated dependencies [45724ee]
  - @forumone/throughline-design-contract@0.5.0

## 0.3.0

### Minor Changes

- 14f2be4: A contract can say a boolean starts ticked, and be believed

  `boolean` fields were generated as `{ type: 'checkbox', defaultValue: false }`,
  with the `false` hardcoded. That made a component's own default unreachable from
  the CMS. A checkbox is stored ticked or unticked and never absent, so `coerce`
  always had a value to turn into a real boolean, the prop was never `undefined`,
  and a signature default like `hasFacade = true` could not apply. Every boolean a
  contract described arrived at its component as `false`, whatever the component
  said.

  It was not theoretical. `VideoEmbed.hasFacade` exists to keep a provider's
  iframe — several hundred kilobytes and its third-party cookies — off the page
  until a reader presses play, and its contract says "Leave on". Every embed an
  author added shipped with it off: the YouTube iframe was in the server HTML from
  first paint, setting cookies on readers who never pressed play, on a site whose
  stated rule is that no third-party tracking runs before consent.

  So `ContentField` gains an optional `defaultValue`, read by the checkbox branch
  and rejected on any other field type — anywhere else it is a value the author
  expects to take effect and nothing ever would.

  `allOrNothing` had to learn about it too. That rule treats `false` as "nobody
  touched this", which is right for a checkbox that starts unticked and exactly
  wrong for one that starts ticked: left alone, a group holding a ticked-by-default
  boolean would never look empty, and the rule would demand the group's required
  children of an author who had typed nothing. It now takes a field's declared
  default into account rather than the value alone.

  **Existing stored values are untouched.** `defaultValue` applies to a field an
  author has not yet filled in, so blocks already saved keep whatever is in the
  database; a `VideoEmbed` saved before this change still renders without its
  facade until someone edits it.

### Patch Changes

- Updated dependencies [14f2be4]
  - @forumone/throughline-design-contract@0.4.0

## 0.2.0

### Minor Changes

- 113c601: The design-system-to-Payload bridge joins the suite

  `@forumone/throughline-design-system-payload` turns a component manifest into Payload blocks and those blocks back into React. It lived in the first site to use it; every Throughline site needs it, and a second one copying it by hand is the drift the contract system exists to prevent.

  Moved with `git subtree`, so its history came too. Private and unpublished for now — a `dist` build and `.js` import extensions are what it would need to publish, and nothing needs that while consumers take it from the workspace.

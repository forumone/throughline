# @forumone/throughline-design-system-payload

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

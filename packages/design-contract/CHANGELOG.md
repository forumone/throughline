# @forumone/throughline-design-contract

## 0.4.0

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

## 0.3.0

### Minor Changes

- 24bd325: Add an optional `group` to the component contract, so an authoring UI can shelve components separately from what they are.

  `category` was answering two questions at once — what a component _is_, and where an editor looks for it — and it is a bad answer to the second at any real size. A design system of sixty blocks files roughly half of them under `section`, so a picker grouped on `category` hands back the flat list the grouping was meant to avoid while `card` and `navigation` hold one entry each. Evening the shelves out within `category` would file components under the wrong kind for every consumer that reasons about kind, including `list_components`.

  So `category` keeps its meaning and its enum, and `group` takes the second question with a vocabulary of shelf labels: `hero`, `narrative`, `proof`, `listing`, `media`, `form`, `cta`, `navigation`, `utility`. No `section`, which is the problem being solved; no `card` or `data`, which name a kind rather than a place to look.

  New API: `groupOf(component)` resolves `group ?? category`, and `LoadedManifest` gains `listByGroup()` and `listGroups()` which match on the resolved value. Grouping consumers should call `groupOf` rather than reading either field.

  Non-breaking. `group` is optional, and the fallback means a design system that sets none groups exactly as it did before.

## 0.2.0

### Minor Changes

- [#9](https://github.com/forumone/throughline/pull/9) [`337f2ca`](https://github.com/forumone/throughline/commit/337f2ca779a30d2f135845259bbae8e961a625ed) Thanks [@briangraves](https://github.com/briangraves)! - Initial release. Defines `ComponentContractSchema`, `ManifestSchema`, `loadManifest`, `loadManifestFromUrl`, and `lintManifest`. Every design system that satisfies this contract is a valid input to the framework's Component Server.

# @forumone/throughline-design-system-payload

## 0.8.0

### Minor Changes

- f8e56bc: A block's alt text falls back to the media library's

  An image's alt field in a block (`imageAlt` beside `image`, or `alt` beside `src` in an image group or row) used to be the only alt the component got, so authors typed a description the media record already had, or left it empty and the image rendered as decorative. Now an empty block alt is filled from the media document's `alt`. A block's own alt still wins when it is filled in.

  Those alt fields are now generated as optional, with a note saying they fall back, and an optional image group no longer demands its alt once the image is chosen. Blocks are stored as JSON, so this changes no columns. The catch: an empty block alt no longer marks an image as decorative.

- c8a86bf: Adds test helpers for a site's generated blocks, on a new `./testing` subpath. `vitest` is an optional peer.

  - `describeBlockInvariants(blocks, options?)` checks two things. First, every generated `validate` must accept the data Payload stores for a newly added block, both with no array rows and with one empty row. Second, every generated checkbox must start at its contract's `defaultValue`, and no generated text field may have a string default. It accepts `generateBlocks` output, or plain blocks together with the manifest.
  - The `check-block-props` bin takes a manifest, one or more component directories and an optional `--overrides` module. It coerces each contract through `coerceBlock` and compares the resulting prop shapes with the component's `<Name>Args.ts`. It exits non-zero on a mismatch, and also when there were no args files to compare against.

- ab623e1: The `payload` peer range moves from `^3.0.0` to `^3.89.0` for every package that has one. **A site on Payload older than 3.89.0 must upgrade Payload before upgrading these packages.**

  Before 3.89.0, the `payload-mcp-api-keys` collection that `@payloadcms/plugin-mcp` adds registered Payload's API-key strategy on every REST route. Any key could then become `req.user` outside `/api/mcp` and pass access rules written as `Boolean(req.user)`. Every Throughline site runs that plugin, so the floor is the same for every package. No package's code changes with this bump.

## 0.7.1

### Patch Changes

- f73295b: A collapsed block's header stays one line.

  A heading long enough to wrap made the header — and the block-type pill with
  it — two or three lines tall, because Payload's header is a flex row whose
  items stretch to the tallest. The summary is now a single line ending in an
  ellipsis, and the number and pill keep their own height.

## 0.7.0

### Minor Changes

- f89cbf2: A collapsed block says what it holds, not only what type it is.

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

- e561655: An opened block says what it is for.

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

- 18461c9: A generated select's options, and the picker's names, read as words.
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

## 0.6.0

### Minor Changes

- 20e606b: A generated array's rows can be read without opening them.
  - A row made only of two or three short single-line text fields — a stat's
    figure and label, a fact's label and value — is drawn on one line, each
    field as wide as its `maxLength` against the others', and never under a
    quarter of the line for two fields.
  - A row's header says what it holds: "96% · of users reached the form" or
    "Client · USAID", read from its first one or two plain-text fields, instead
    of "Stat 03". An empty row keeps Payload's own counter. Settings, `advanced`
    fields and a call to action's label never name a row.

  Both are drawing only: stored data and generated types are unchanged. The row
  header is a client component at
  `@forumone/throughline-design-system-payload/client#RowSummary`, so a host
  regenerates its import map, and `@payloadcms/ui` is now a peer dependency.

## 0.5.0

### Minor Changes

- 2bf29e6: Generated blocks are arranged for an author to read, not in the shape the
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

### Patch Changes

- Updated dependencies [2bf29e6]
  - @forumone/throughline-design-contract@0.6.0

## 0.4.4

### Patch Changes

- 79ec481: Revert `admin.allowEdit: false` on generated upload fields. It never did
  anything, and 0.4.3's entry describing it is wrong.

  **0.4.3 claimed that a generated upload field "offers the reference and not the
  document". It does not, and did not.** Anyone who read that entry and stopped
  worrying about editors replacing a shared asset from inside a block should start
  again. The behaviour is unchanged from 0.4.2.

  `admin.allowEdit` is not honoured on an upload field in payload 3.87.1, for
  three independent reasons:
  - **It is not an option.** `UploadAdmin` is `allowCreate` and `isSortable`.
    `allowEdit` belongs to `RelationshipAdmin`, which is a different field type.
  - **It would not survive the trip to the client.** `UploadAdminClient` is
    `AdminClient & Pick<UploadAdmin, 'allowCreate' | 'isSortable'>`.
  - **The component does not read it.** `@payloadcms/ui`'s `fields/Upload/HasOne`
    renders `allowEdit: !readonly`, hardcoded. Compare `allowCreate`, which _is_
    wired through from the field config in `fields/Upload/index.js`.

  So the pencil can only be removed with `readOnly`, which takes the picker with
  it. The asymmetry with `allowCreate` reads as an upstream oversight rather than
  a decision and is filed as one; until it moves, this is a Payload behaviour a
  host designs around rather than a generator setting.

  What replaces the code is a note at `toPayloadField` saying all of the above,
  because the fix looks obvious, has now been tried once, and would be tried
  again.

  **Why it passed every gate**, which is the part worth carrying forward. It was
  written through a helper returning `{ admin: Record<string, unknown> }`, and
  that widening is exactly what suppresses TypeScript's excess-property check —
  written inline, `tsc` rejects `allowEdit` on an upload's admin, and does so
  today. The tests then asserted the key was present _on the generated config
  object_, which is one end of a string whose other end nothing reads. The
  replacement tests assert what this file actually controls: that an image
  field's `admin` carries the contract's description and no keys of its own, and
  that a field with no constraints gets no `admin` at all.

  `allowCreate` was never set by the reverted code and is still untouched.

## 0.4.3

### Patch Changes

- e6eece8: A generated upload field offers the reference and not the document:
  `admin.allowEdit: false` on every `image` field and on a `videoUpload`.

  Payload's upload field puts two actions side by side and they look alike. The
  picker changes which library document this block points at — local to the block,
  carried by the draft, published when the page is. The pencil opens that document
  in a drawer where the file itself can be replaced — global, immediate, and
  invisible from where it is offered.

  Three facts compound, and a host has none of them on screen:
  - a media document is shared by every block that picked it;
  - an upload collection is conventionally unversioned, so replacing the file is
    live the moment it is saved — there is no draft of it to hold back;
  - a host storing blocks as JSON has no `_rels` row for an upload inside one, so
    nothing can compute what else points at the document.

  Downstream that turned "change the photograph on this page" into "change it on
  all five pages that picked this photograph, now, while the page you are looking
  at is still a draft" — which then read to the editor as Save draft having
  published. Five heroes had been seeded from one stock image; the render path was
  never involved.

  `allowCreate` is deliberately untouched. Uploading a new file is the safe answer
  to "I want a different picture here" and stays one click, or this would trade a
  shared-asset bug for editors editing the shared asset because adding one was
  tedious. What is removed is the one action whose blast radius cannot be seen
  from where it is offered.

  `admin.description` still survives — it is built from the contract's
  `constraints` and was the only thing in `admin` before this, so the merge is
  asserted by a test rather than left to whoever edits the helper next.

  No knob to put the pencil back. `overrides` cannot express it today and adding
  one is worth doing when somebody wants it; refusing by default is the right way
  round, because the failure is silent and the recovery is manual.

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

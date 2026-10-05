# @forumone/throughline-design-system

## 2.4.0

### Minor Changes

- c49a98b: A block with an empty required field no longer passes `check` or takes a page down (forumone-2026#840).

  - **Publishing:** the composition step reports a `required-field` issue for each required field inside a block that is empty, for example "Block 3 (Featured Work) › Item 2 › Image is required before this can be published."
    - `check`, `get_publish_status` and the admin's publish all see it before the write.
    - Before this, only Payload's write enforced `required`, and `check` called such a page ready.
    - The rule walks the block's Payload config. So a field the site adds counts, such as a form block's `source.form`. A field the site omits or hides doesn't. A required link counts too, because the contract says so even though a generated link enforces it with a validate.
  - **Render:** `RenderBlocks` no longer renders a component whose required image didn't arrive, whether the slot is empty in a draft or the image no longer resolves.
    - The component would read `item.image.src` from nothing and throw, and one card took Live Preview down to the error page.
    - The new `onIncompleteBlock` decides what renders instead. It defaults to nothing.
    - `missingRequiredImages` is exported for a host to ask the same question.

## 2.3.0

## 2.2.0

### Minor Changes

- 623d42c: Messages an editor can read now make sense to an editor: they say what happened in the editor's terms, what to do next, and to "tell a site administrator" when only somebody else can fix it. (forumone-2026#805)

  - **The publish-blocked notification lists issues where the editor finds them.** It no longer starts "Blocked at: composition", lists `layout[2]: …` or `(root): …`, or prefixes "Suggestion:". Every pipeline issue gains `where`, its `field` as the collection's labels say it — `Block 3 (Image Hero) › Image`, `SEO › Title` — computed from the field config for built-in and custom checks alike, and the admin prints it before the message. An issue marked on an ancestor field (three blocks' problems on `layout`) says which block it is about.
  - **Components are named by their block's label,** not their contract name. The composition validator takes a `label` function; the publish step passes each block's `labels.singular`, and the `validate_composition` MCP tool keeps contract names. `componentDisplayName` (`ImageHero` → `Image Hero`) is exported from `@forumone/throughline-design-system/contract`.
  - **Every step's wording is rewritten** — not found, already published, composition, accessibility, required fields, embargo, expiry, approval, document locked (now naming who holds the lock), field validation — as are the individual checks (alt text, link text, SEO title and description, slug) and the composition rules (unknown component, unknown variant, forbidden neighbours, maximum per page, placement, recipes, empty block). Tests and hosts asserting the old strings need updating; `code`, `rule`, `failedAt` and `field` are unchanged.
  - **Setup problems no editor can fix** (`components-server-missing`, `approval-resolver-missing`, a collection not registered as publishable) say to tell a site administrator. The setup instruction moves to a new `detail` field, which is logged and still returned to MCP callers.
  - **Dates read like dates.** An embargo's end or an expiry is written `Tue 6 Oct 2026, 1:00 pm UTC` in the zone set by the new `publishing.timeZone` option (IANA, default `UTC`), and returned as `when: { at, text }`; the admin rewrites it into each editor's own zone.
  - **Connection and server problems** in the admin say whether anything changed and what to do. A malformed request to the publishing endpoints reads as an unexpected problem, with the specifics in `detail`.
  - **Unpublish, schedule and cancel** results carry a `code` (`not-found`, `not-published`, `not-scheduled`, `invalid-time`, `time-in-past`), and cancelling a schedule when nothing was scheduled no longer reports success. The trust boundary's refusal of a direct `_status` write (bulk publish, restore as published) tells the editor to use the document's own Publish or Unpublish button.
  - **A failed event after a publish** warns in terms of what the editor will see; which event and why go to the log.
  - **Composition warnings are no longer dropped.** A component missing the sibling its contract `requiredSiblings` names now reaches the publish result's `warnings`.
  - **The one-hero check fires.** `heading-hierarchy` matched only a block typed `hero`, which no design system has, so it never ran. It now counts blocks whose contract `category` is `hero` (custom checks receive a third `context` argument with the components), falling back to the old match without the components plugin.
  - **The in-use refusal reaches the editor.** It was a non-public 500, which Payload replaces with "Something went wrong."; it is now a public 503. Its list names each document's collection by its singular label and the place by its field labels: `• Case Study › Acme rebrand (Layout › Block 2 (Card Grid) › Card 1 › Image)`. References carry `dataPath` and `where`.
  - **`refuseSlugHeldInTrash`, `refuseMimeTypesOutside` and `refuseStorageKeyMismatch`** pass `req.t` to `ValidationError`, so a site's translation of "The following field is invalid:" applies. The upload-path refusals are rewritten, and the two storage paths are logged instead of shown.
  - **Integrations:** an unknown type or invalid settings is now an `APIError` 400, which Payload shows, instead of an `Error` it replaced with "Something went wrong.". `lastError` opens with a one-line summary anybody can read before the integration's own detail.
  - **Approval links:** an invalid, expired or withdrawn link says so in plain words and what to do; why a token failed goes to the log.
  - **Generated blocks:** the "needed once anything else here is filled in" message names fields by their label ("Video URL"), not their name (`src`).

- 332baf9: Publishing refuses a page whose internal links go to a draft, trashed or deleted document (forumone-2026#756). A new pipeline step, `link-targets`, runs after `required-fields` and looks up every link's target. A deleted target, a trashed one, or an unpublished one in a collection with drafts blocks the publish (`code: 'link-targets'`). Each issue names the block or field and the target's title, and its `field` is the link's own path, so the admin marks it. An unpublished target with a scheduled publish time is a warning, not a block.

  **This is a new blocking step, and it's on by default.** After upgrading, a page that already links to a draft or trashed page can't be published until the link is fixed. `get_publish_status` and `check` report it like any other blocker. To switch it off, set `publishing: { linkTargets: { enabled: false } }`.

  A link is either an internal link in Lexical rich text, or a relationship field marked with `custom: { throughlineLinkTarget: true }`. The design-system generator's `linkField` now marks its `reference`, so every generated link is covered without changes. To cover a hand-written link field, wrap it in `markLinkTarget` from `@forumone/throughline/publishing`. A marked reference whose sibling `mode` isn't `internal` is ignored, and `markLinkTarget(field, { when })` takes a different rule. The structural walk behind `referencesIn` is now `walkDocument`, exported from `/media` along with `linkTargetsIn`.

## 2.1.0

## 2.0.0

## 1.9.1

## 1.9.0

## 1.8.0

## 1.7.0

### Minor Changes

- e473c47: Adds `@forumone/throughline-design-system/recipes`: composed sections stored as data. A recipe is a provisional component contract plus a tree of the manifest's primitives and inline components, with every word bound to a content field. `lintRecipe` checks a recipe against the current manifest (props, slots, bindings, heading order, image fields, component placement and required fields, size and depth) and reports each issue with its path. `RenderRecipe` draws a recipe with the host's components, through the same `CoerceContext` blocks use.

## 1.6.0

### Minor Changes

- d8178f0: Contract 1.1.0 adds `primitives` to the manifest: layout and content building blocks that a composed section can be made of, but that never become blocks on their own. A `PrimitiveContract` declares closed-set `props` (`token`, `enum` or `boolean`), `slots` for a layout primitive, and `content` for a content primitive. `lintManifest` checks that every token a primitive allows exists and belongs to the prop's token group. Manifests at 1.0.0 still load, as having no primitives. Before this, an unknown top-level key was stripped silently.

## 1.5.0

## 1.4.0

## 1.3.0

## 1.2.0

## 1.1.0

## 1.0.1

## 1.0.0

### Major Changes

- 825f4e9: `@forumone/throughline-design-system`: the 1.0 design-system package, from `@forumone/throughline-design-contract` and `@forumone/throughline-design-system-payload`, by `docs/spec/1.0-exports.md`. It is published for the first time: design-system-payload was private and shipped TypeScript source, and this package builds to `dist`.

  - `@forumone/throughline-design-contract` is `/contract`, and its `/lint` is `/lint`.
  - design-system-payload's `/generate`, `/render`, `/client` and `/testing` keep their names. Its root (`fieldOverride` and the override types) is part of `/generate`.
  - The `check-block-props` bin is unchanged, and runs the built CLI.
  - Admin component paths are `@forumone/throughline-design-system/client#BlockSummary`, `#BlockGuidance` and `#RowSummary`, so a site's `importMap.js` changes.
  - `/contract` and `/lint` need no peers. `payload`, `react`, `@payloadcms/ui`, `typescript` (which `/generate` uses to read component source) and `vitest` (for `/testing`) are optional peers.

  `@forumone/throughline/components` now reads manifests through `@forumone/throughline-design-system/contract`.

## 1.0.0-next.2

## 1.0.0-next.0

### Major Changes

- 825f4e9: `@forumone/throughline-design-system`: the 1.0 design-system package, from `@forumone/throughline-design-contract` and `@forumone/throughline-design-system-payload`, by `docs/spec/1.0-exports.md`. It is published for the first time: design-system-payload was private and shipped TypeScript source, and this package builds to `dist`.

  - `@forumone/throughline-design-contract` is `/contract`, and its `/lint` is `/lint`.
  - design-system-payload's `/generate`, `/render`, `/client` and `/testing` keep their names. Its root (`fieldOverride` and the override types) is part of `/generate`.
  - The `check-block-props` bin is unchanged, and runs the built CLI.
  - Admin component paths are `@forumone/throughline-design-system/client#BlockSummary`, `#BlockGuidance` and `#RowSummary`, so a site's `importMap.js` changes.
  - `/contract` and `/lint` need no peers. `payload`, `react`, `@payloadcms/ui`, `typescript` (which `/generate` uses to read component source) and `vitest` (for `/testing`) are optional peers.

  `@forumone/throughline/components` now reads manifests through `@forumone/throughline-design-system/contract`.

The 0.x entries below are `@forumone/throughline-design-contract`'s. `@forumone/throughline-design-system-payload` was never published.

## 0.6.0

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

## 0.5.1

### Patch Changes

- 957403b: One `@types/node`, so a host does not end up with two copies of `@payloadcms/ui`

  Twelve packages asked for `@types/node@^20.17.0` and `design-system-payload`
  asked for `^24.13.2`. Inside this repository that is untidy. Inside a host that
  consumes the suite from source — which is how `forumone/forumone-2026` uses it,
  as a git submodule in one pnpm workspace — it is a runtime failure.

  pnpm hashes a package's identity with its resolved peers. `publishing` and
  `integrations` both take `@payloadcms/ui` as a peer _and_ as a devDependency, so
  each got its own copy resolved against `@types/node@20`, while the host's copy
  resolved against `@types/node@24`. Same version, 3.87.1, two directories:

      apps/web                     → @payloadcms+ui@3.87.1_…_9ce0de5c…
      packages/publishing          → @payloadcms+ui@3.87.1_…_13184ec4…
      packages/integrations        → @payloadcms+ui@3.87.1_…_13184ec4…

  Two directories are two module instances. Two instances of `@payloadcms/ui` are
  two `ConfigContext` objects, and `PublishButton` read the one the admin's
  provider had never populated:

      TypeError: Cannot destructure property 'config' of useConfig() as it is undefined

  The host saw an intermittent 500 on every admin document view — `PublishButton`
  is installed on each collection with a publish policy, so lists, `/admin` and
  the login screen were all fine and only editing broke. Nothing caught it:
  install, `--frozen-lockfile`, typecheck, lint and every test passed, because the
  two copies are byte-identical and the split exists only at module resolution.
  forumone/forumone-2026#498.

  Aligning on `^24.13.2` collapses them to one instance. Nothing here targets a
  Node 20 API deliberately; the packages typecheck and test unchanged against the
  newer types.

  `create-throughline` keeps `^20.17.0` on purpose. It is the one package
  declaring `engines.node: >=20.9.0`, and typechecking a CLI against types newer
  than the runtime it promises to support is how a Node 24-only call ships to
  somebody on Node 20.

## 0.5.0

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

# @forumone/throughline-design-contract

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

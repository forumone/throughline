# @forumone/throughline-reference-ds

## 0.3.4

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

- Updated dependencies [957403b]
  - @forumone/throughline-design-contract@0.5.1

## 0.3.3

### Patch Changes

- Updated dependencies [45724ee]
  - @forumone/throughline-design-contract@0.5.0

## 0.3.2

### Patch Changes

- Updated dependencies [14f2be4]
  - @forumone/throughline-design-contract@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [24bd325]
  - @forumone/throughline-design-contract@0.3.0

## 0.3.0

### Minor Changes

- e994176: Add layout tokens and a Storybook "Foundations" section.

  New `layout` tokens (container max-widths, gutter, page margin, breakpoints) emit as `--layout-*` CSS custom properties, filling the previous gap where the DS had no container/breakpoint scale. New Foundations stories — Colors, Typography, Spacing, Radii, Elevation, and **Layout & Containers** — document the tokens visually in Storybook.

## 0.2.0

### Minor Changes

- [#11](https://github.com/forumone/throughline/pull/11) [`b46635d`](https://github.com/forumone/throughline/commit/b46635d311d7172c0f6d439b9146f809f2ce2339) Thanks [@briangraves](https://github.com/briangraves)! - Initial release. Twelve components (Hero, SectionIntro, Prose, MediaBlock, Card, CardGrid, CTASection, Stats, FAQ, Quote, Divider, Spacer) with full `ComponentContract` metadata, Storybook stories, unit tests, and a generated manifest. Serves as the reference implementation for contract compliance, a test fixture for core packages, and a starting template for client projects without their own design system.

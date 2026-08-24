# @forumone/throughline-reference-ds

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

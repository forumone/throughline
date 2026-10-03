---
'@forumone/throughline-design-system': major
'@forumone/throughline': patch
---

`@forumone/throughline-design-system`: the 1.0 design-system package, from `@forumone/throughline-design-contract` and `@forumone/throughline-design-system-payload`, by `docs/spec/1.0-exports.md`. It is published for the first time: design-system-payload was private and shipped TypeScript source, and this package builds to `dist`.

- `@forumone/throughline-design-contract` is `/contract`, and its `/lint` is `/lint`.
- design-system-payload's `/generate`, `/render`, `/client` and `/testing` keep their names. Its root (`fieldOverride` and the override types) is part of `/generate`.
- The `check-block-props` bin is unchanged, and runs the built CLI.
- Admin component paths are `@forumone/throughline-design-system/client#BlockSummary`, `#BlockGuidance` and `#RowSummary`, so a site's `importMap.js` changes.
- `/contract` and `/lint` need no peers. `payload`, `react`, `@payloadcms/ui`, `typescript` (which `/generate` uses to read component source) and `vitest` (for `/testing`) are optional peers.

`@forumone/throughline/components` now reads manifests through `@forumone/throughline-design-system/contract`.

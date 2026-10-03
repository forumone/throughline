---
'@forumone/throughline': minor
---

`throughline migrate-imports [paths…] [--dry-run]`, a new bin: rewrites every 0.x `@forumone/throughline-*` import to its 1.0 home, by `docs/spec/1.0-exports.md`. It splits an import by where each name went, keeps `type` and aliases, rewrites admin component paths (`importMap.js` included), and points mocks, dynamic imports and module augmentation at the 1.0 counterpart for you to check. Names 1.0 removed or made internal are left in place and listed with what to use instead, as are the `package.json` dependencies to swap, and it exits 1 while anything is left. Run on forumone-2026, it rewrites 163 files and leaves the five imports `throughline()` replaces.

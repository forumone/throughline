---
'@forumone/create-throughline': minor
---

A scaffolded project ships a two-tier CI workflow:

- `fast` runs on every pull request with no database. It installs from the lockfile, then runs typecheck, lint, the workspace and migration gates, manifest validation, a generated-files check and tests, with a non-blocking audit.
- `verify` runs on pushes to main. It migrates a fresh Postgres and runs a production build.

`check-generated.sh` regenerates `payload-types.ts` and the admin import map and fails on any difference, including an uncommitted file. `apps/web` gains `generate:types` and `generate:importmap`.


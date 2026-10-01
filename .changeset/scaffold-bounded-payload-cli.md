---
'@forumone/create-throughline': minor
---

A scaffolded project runs every Payload CLI script — `payload`, `generate:types`, `generate:importmap`, `migrate`, `migrate:create`, `migrate:status` — through core's `throughline-payload`, so a hung run is killed rather than left spinning after its shell dies. It adds `payload:reap` to `apps/web` and the root, and ignores `.payload-cli-pids`.

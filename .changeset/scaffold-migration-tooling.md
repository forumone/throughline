---
'@forumone/create-throughline': minor
---

A scaffolded project manages its schema through migrations from the first table on:

- **Config.** `payload.config.ts` sets `push: false` and an explicit `migrationDir`. It connects through a resolver that knows the Vercel–Neon integration's variables, keeps a migration off Neon's pooled endpoint, and accepts an optional migration-only credential.
- **Scripts.** `apps/web` gains `migrate`, `migrate:create`, `migrate:status`, `migrate:snapshot` and `check:migrations`. The check asserts that every migration has its schema snapshot, that no snapshot is orphaned, and that no drop follows a `CASCADE` that has already carried it out.
- **Write guard.** `scripts/lib/target.ts` gives scripts that write to a database a `requireTarget` guard.

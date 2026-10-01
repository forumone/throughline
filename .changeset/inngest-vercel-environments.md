---
'@forumone/throughline-core': minor
---

Adds Inngest environment pinning for Vercel, moved from forumone-2026. Additive.

- `resolveInngestEnv()` returns `production` on Vercel production, `preview` for every Vercel preview, and `undefined` elsewhere, for `createInngestClient`'s `env`. Without it, the SDK names an environment after each branch, and each one runs a full copy of every cron. An explicit `INNGEST_ENV` still wins, and local dev is left alone even when `.env.local` came from `vercel env pull`.
- `registrableInngestFunctions(functions)` drops the cron-only functions in a preview, and keeps any function an event also triggers. `registersInngestCrons()` is the predicate on its own.

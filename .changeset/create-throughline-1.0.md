---
'@forumone/create-throughline': major
---

The scaffold builds a 1.0 site. It depends on `@forumone/throughline` and, with the reference design system, `@forumone/throughline-design-system`, rather than on the nine 0.x packages. `payload.config.ts` registers the suite with one `throughline()` call, and `app/api/inngest/route.ts` serves `suite.jobs`, with the one Inngest client in `lib/inngest.ts`. Forms is no longer scaffolded, nor is `FORMS_IP_HASH_SECRET` asked for. The template's stub approval resolver, which overrode the approvals plugin's own and so blocked every publish that required approval, is gone.

From 1.0 the scaffolder is versioned with `@forumone/throughline` and `@forumone/throughline-design-system`: one version across the three.

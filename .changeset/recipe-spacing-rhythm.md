---
'@forumone/throughline-design-system': minor
---

`lintRecipe` adds a `spacing.rhythm` rule. A layout nested in one of the same kind (a Stack in a Stack, a Cluster in a Cluster) must use a smaller gap than the one around it, or nothing in it reads as a group. `compose_section` refuses a recipe that breaks the rule. The publish gate re-lints recipes, so an approved recipe that breaks it stops publishing until it's fixed (forumone-2026#847).
